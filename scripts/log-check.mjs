#!/usr/bin/env node
/**
 * THE LOG CHECK — read-only, started by hand by the founder on GitHub.
 *
 * Every live service writes its own log lines, built to hold no personal data
 * and no money. Nobody had read a real line: this asks Cloudflare for a few
 * recent lines of each service and says, per service, how many lines it read
 * and whether anything shaped like a phone number, an e-mail, a map point, a
 * code, a secret, a name, an address or an amount sat in them, and where (by
 * key path only).
 *
 * THE RUN PAGE IS PUBLIC (the repository is). So it never prints a value, an
 * id, a log line or a response body: only counts, key paths whose every
 * segment is a name on a fixed list (any other key shows as « [clé non
 * affichée] »), and Cloudflare's own error codes and short clean messages.
 * It changes nothing anywhere: one read query per service.
 *
 * THE RESPONSE SHAPE IS NOT KNOWN from here (the sandbox that built this
 * cannot reach Cloudflare). So the scan is blind to shape — every key and
 * every value anywhere in `result` is read, and JSON kept as text (whole,
 * after a few words, or encoded twice) is read as a tree — and a wrong guess
 * can only show as « NON LU », never as a pass: a service is OK only when at
 * least one of ITS lines was read and nothing was found. One of its lines is
 * an event whose `$metadata.service` names it AND that holds the frame every
 * house logger writes (one object with both a `correlation_id` and a `msg`
 * key): an event holding nothing the service wrote is no line read. The
 * founder's first real run is what proves the shape.
 *
 * Inputs (environment): CLOUDFLARE_LOGS_TOKEN (a key of its own, never the
 * deploy key, holding on the one account the one permission Cloudflare's
 * query accepts, « Workers Observability Write »: there is no read-only one;
 * the script itself only reads) · CLOUDFLARE_ACCOUNT_ID · LOG_CHECK_HOURS (1–168,
 * default 72) · LOG_CHECK_SERVICES (comma-separated Worker names, default the
 * six live services). Exit 0 only when every service is OK; 1 otherwise; 2
 * when an input is missing or malformed. Node 22, no dependency, no install.
 * Proved by scripts/gates/log-check-proof.mjs.
 */
import { pathToFileURL } from 'node:url';

const API = 'https://api.cloudflare.com/client/v4';
const SERVICES = ['custody-service', 'logistics-service', 'storefront-service', 'offer-service', 'media-service', 'protection-service'];
const HEURES = 72;
const HEURES_MAX = 168;
// The real cap is 100 or 2000 (not known); 100 is valid under both.
const PAGE = 100;
const DELAI_MS = 30_000;
const NOM_WORKER = /^[a-z][a-z0-9-]{0,62}$/;

export const GENRES = [
  ['telephone', 'téléphone'],
  ['email', 'e-mail'],
  ['carte', 'point sur la carte'],
  ['cle', 'code, secret, nom ou adresse'],
  ['montant', 'montant'],
];

// ─── What a hit is ─────────────────────────────────────────────────────────

// Ids are masked before the digit patterns run: a minted UUID or a long hex id
// often holds eight digits in a row and would read as a phone number. A phone
// number holds no letter a–f, so masking these hides none.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_LONG = /(?<![0-9A-Za-z])(?=[0-9A-Fa-f]*[A-Fa-f])[0-9A-Fa-f]{16,}(?![0-9A-Za-z])/g;
// ISO dates and times are masked too: with « - » and « . » between a phone's
// pairs, « 2026-11-28 » and the « 00.123456 » of « 08:00:00.123456 » would
// read as one. A phone holds no « : », and is never written 4-2-2.
const DATE_ISO = /(?<![0-9])(?:19|20)[0-9]{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])(?![0-9])/g;
const HEURE_ISO = /(?<![0-9])(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:[.,][0-9]+)?)?(?![0-9])/g;
// Burkina: eight digits, a space, a non-breaking space, « . » or « - »
// allowed between pairs and after 226, +226 / 00226 / 226 in front.
// Digit-bounded, so a longer run (a timestamp) is never one.
const TELEPHONE = /(?<![0-9])(?:(?:\+|00)?[  ]?226[  .-]?)?[0-9]{2}(?:[  .-]?[0-9]{2}){3}(?![0-9])/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const POINT = /(?<![0-9.])[-+]?[0-9]{1,3}\.[0-9]{2,}(?:[  ]*[,;][  ]*|[  ]+)[-+]?[0-9]{1,3}\.[0-9]{2,}(?![0-9])/;
const MONTANT = /(?<![0-9A-Za-z])[0-9]+(?:[   .][0-9]{3})*[   ]?(?:F[  ]?CFA|FCFA|XOF|CFA|F)(?![A-Za-z0-9])/;
const DEVISE = /(?<![A-Za-z])(?:F[  ]?CFA|XOF)(?![A-Za-z])/i;

// Key names, matched as whole words of the key (camelCase, snake_case and
// kebab-case split), so « pin » in « shipping » or « nom » in « economics »
// is no hit; the long compounds also match inside a key written as one word.
const MOTS = {
  telephone: ['phone', 'phones', 'tel', 'telephone', 'telephones', 'mobile', 'msisdn', 'whatsapp', 'portable', 'cellulaire'],
  email: ['email', 'emails', 'mail', 'mails', 'courriel', 'courriels'],
  carte: [
    'lat', 'lng', 'lon', 'latitude', 'longitude', 'coord', 'coords', 'coordinate', 'coordinates', 'coordonnee', 'coordonnees',
    'geo', 'geoloc', 'geolocation', 'gps', 'position', 'location', 'localisation', 'pin',
  ],
  cle: [
    'otp', 'password', 'passwd', 'mdp', 'secret', 'secrets', 'token', 'tokens', 'authorization', 'bearer', 'cookie', 'cookies',
    'challenge', 'signature', 'apikey',
    'address', 'adresse', 'addr', 'street', 'rue', 'quartier', 'zone', 'landmark', 'repere', 'directions', 'indication',
    'indications', 'relay', 'postal', 'zip', 'postcode', 'city', 'ville', 'ip',
    'voice', 'voix', 'vocal', 'vocale', 'audio', 'note', 'notes',
    'prenom', 'surname', 'firstname', 'lastname', 'fullname', 'displayname', 'username', 'contact',
  ],
  montant: [
    'amount', 'amounts', 'montant', 'montants', 'price', 'prices', 'prix', 'fee', 'fees', 'frais', 'total', 'totals', 'subtotal',
    'fcfa', 'xof', 'cfa', 'balance', 'solde', 'payout', 'payouts', 'refund', 'refunds', 'remboursement', 'commission',
    'commissions', 'markup', 'marge', 'gain', 'gains', 'earnings', 'cost', 'costs', 'cout', 'capital', 'cash', 'versement',
  ],
};
const COMPOSES = {
  telephone: ['telephone', 'whatsapp', 'msisdn'],
  email: ['email', 'courriel'],
  carte: ['latitude', 'longitude', 'coordinates', 'coordonnees', 'geolocation'],
  cle: ['password', 'motdepasse', 'landmark', 'adresse', 'address', 'apikey', 'forwardedfor'],
  montant: ['montant', 'remboursement', 'commission', 'subtotal', 'fcfa'],
};
const MOTS_PAR_GENRE = Object.fromEntries(Object.entries(MOTS).map(([g, m]) => [g, new Set(m)]));
// « code » and « name » are everywhere in technical keys (statusCode,
// scriptName); after these words they name no person and no secret.
const CODE_TECHNIQUE = new Set(['status', 'error', 'http', 'response', 'exit', 'country', 'currency', 'language', 'lang', 'region', 'metro', 'iso', 'reason']);
const NOM_TECHNIQUE = new Set([
  'script', 'service', 'class', 'host', 'event', 'file', 'route', 'worker', 'function', 'dataset', 'span', 'trace', 'metric',
  'field', 'type', 'binding', 'queue', 'outbox', 'error', 'method', 'domain', 'bucket',
]);
// The protection service's lines carry no reason, reference or key at all: a
// claim's reason is free text, its evidence bundle and its settlement are
// references. Elsewhere `reason` is a fixed technical code (`no_supplier`).
const PROTECTION = 'protection-service';
const MOTS_PROTECTION = new Set(['reason', 'reference', 'ref']);
const COMPOSE_PROTECTION = 'evidencebundleid';
const SEULE_PROTECTION = 'key';

function mots(cle) {
  return cle
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((m) => m !== '');
}

function genresDuTexte(texte) {
  const genres = new Set();
  const masque = texte.replace(UUID, '#').replace(HEX_LONG, '#').replace(DATE_ISO, '#').replace(HEURE_ISO, '#');
  if (TELEPHONE.test(masque)) genres.add('telephone');
  // On the text as it came: a masked id inside an address must not hide it.
  if (EMAIL.test(texte)) genres.add('email');
  if (POINT.test(masque)) genres.add('carte');
  if (MONTANT.test(masque) || DEVISE.test(masque)) genres.add('montant');
  return genres;
}

function genresDeLaCle(cle, service) {
  // A key can itself be a value (an object keyed by phone numbers).
  const genres = genresDuTexte(cle);
  const m = mots(cle);
  const joint = m.join('');
  for (const [genre, ensemble] of Object.entries(MOTS_PAR_GENRE)) {
    if (m.some((w) => ensemble.has(w)) || COMPOSES[genre].some((c) => joint.includes(c))) genres.add(genre);
  }
  if (service === PROTECTION && (m.some((w) => MOTS_PROTECTION.has(w)) || joint.includes(COMPOSE_PROTECTION) || joint === SEULE_PROTECTION)) genres.add('cle');
  m.forEach((w, i) => {
    const avant = i > 0 ? m[i - 1] : '';
    if (w === 'code' && !CODE_TECHNIQUE.has(avant)) genres.add('cle');
    if ((w === 'name' || w === 'nom') && !NOM_TECHNIQUE.has(avant)) genres.add('cle');
  });
  return genres;
}

const estUnPoint = (liste) =>
  liste.length === 2 &&
  liste.every((n) => typeof n === 'number' && Number.isFinite(n) && !Number.isInteger(n) && Math.abs(n) <= 180) &&
  liste.some((n) => Math.abs(n) <= 90);

// ─── Where a hit sat, said without saying anything else ────────────────────

const CLE_CACHEE = '[clé non affichée]';
const RACINE = '(racine)';
const SEGMENT_SUR = /^[$A-Za-z_][A-Za-z0-9_]{0,40}$/;
// The only key names a path may show. A value can be used as a key (a
// person's name, an id) and still look like a plain name, so anything not
// written here shows as « [clé non affichée] ».
const CLES_AFFICHABLES = new Set([
  // The frame every house logger writes, and the fields their callers write.
  'ts', 'level', 'correlation_id', 'service', 'msg',
  'route', 'method', 'status', 'durationMs', 'orderId', 'groupId', 'quoteId', 'error', 'outbox', 'stage', 'phase', 'attempts',
  'reason', 'remaining', 'parked',
  // The answer's own structure (`champs`: where the proof stands our line in
  // for the place Cloudflare really puts it, which is not known from here).
  'events', '$metadata', '$workers', 'source', 'message', 'champs',
  // Every key word the scan itself knows.
  ...Object.values(MOTS).flat(), ...Object.values(COMPOSES).flat(), 'code', 'name', 'nom', ...CODE_TECHNIQUE, ...NOM_TECHNIQUE,
  ...MOTS_PROTECTION, 'evidenceBundleId', SEULE_PROTECTION,
]);

/** A key segment is printed only when it is on the fixed list (and a plain name), never when it could be an id or a value. */
function segment(cle) {
  const chiffres = (cle.match(/[0-9]/g) ?? []).length;
  return CLES_AFFICHABLES.has(cle) && SEGMENT_SUR.test(cle) && chiffres <= 3 && !/[0-9a-f]{12,}/i.test(cle) ? cle : CLE_CACHEE;
}

// A line encoded twice is read through; past this many decodings the text is
// read as text, so no answer can keep the scan decoding.
const RELECTURES = 4;

/** The JSON a text holds, read from its start or from its first « { » or « [ » (« request {…} »); undefined when none. */
function jsonDuTexte(texte) {
  const departs = texte.startsWith('"') ? [0] : [];
  const accolade = texte.search(/[{[]/);
  if (accolade >= 0) departs.push(accolade);
  for (const depart of departs) {
    let lu;
    try {
      lu = JSON.parse(texte.slice(depart));
    } catch {
      continue;
    }
    if (typeof lu === 'string' || (lu !== null && typeof lu === 'object')) return { lu, depart };
  }
  return undefined;
}

/**
 * Scans everything in `result`. An event is an object carrying a `$metadata`
 * object; it counts as one of `service`'s lines only when `$metadata.service`
 * names it AND the house frame (one object with both a `correlation_id` and a
 * `msg` key) sits within it, so neither lines of another service nor an event
 * holding nothing the service wrote can make this one look read. Every hit is
 * counted once per kind at its printable key path.
 */
export function scanne(result, service) {
  const trouvailles = Object.fromEntries(GENRES.map(([g]) => [g, new Map()]));
  const evenements = [];
  const noter = (genres, chemin) => {
    for (const g of genres) {
      const chez = chemin === '' ? RACINE : chemin;
      trouvailles[g].set(chez, (trouvailles[g].get(chez) ?? 0) + 1);
    }
  };
  // An explicit stack: no depth of nesting can escape the scan or overflow it.
  // Each value knows the nearest event around it, so the frame is credited to that event only.
  const pile = [{ valeur: result, chemin: '', genres: new Set(), evenement: null, relu: 0 }];
  while (pile.length > 0) {
    const { valeur, chemin, genres, evenement, relu } = pile.pop();
    if (typeof valeur === 'string') {
      const texte = valeur.trim();
      const trouve = jsonDuTexte(texte);
      if (trouve !== undefined && (typeof trouve.lu !== 'string' || relu < RELECTURES)) {
        // Read as the tree (or the text) it holds, under the same path; the words before it are read as text.
        noter(trouve.depart > 0 ? new Set([...genres, ...genresDuTexte(texte.slice(0, trouve.depart))]) : genres, chemin);
        pile.push({ valeur: trouve.lu, chemin, genres: new Set(), evenement, relu: typeof trouve.lu === 'string' ? relu + 1 : 0 });
        continue;
      }
      noter(new Set([...genres, ...genresDuTexte(valeur)]), chemin);
      continue;
    }
    if (typeof valeur === 'number') {
      noter(Number.isSafeInteger(valeur) && TELEPHONE.test(String(valeur)) ? new Set([...genres, 'telephone']) : genres, chemin);
      continue;
    }
    if (Array.isArray(valeur)) {
      noter(estUnPoint(valeur) ? new Set([...genres, 'carte']) : genres, chemin);
      for (const element of valeur) pile.push({ valeur: element, chemin: `${chemin}[]`, genres: new Set(), evenement, relu: 0 });
      continue;
    }
    if (valeur !== null && typeof valeur === 'object') {
      noter(genres, chemin);
      let ici = evenement;
      const meta = Object.hasOwn(valeur, '$metadata') ? valeur.$metadata : undefined;
      if (meta !== null && typeof meta === 'object' && !Array.isArray(meta)) {
        ici = { sienne: meta.service === service, cadre: false };
        evenements.push(ici);
      }
      if (ici !== null && Object.hasOwn(valeur, 'correlation_id') && Object.hasOwn(valeur, 'msg')) ici.cadre = true;
      for (const [cle, enfant] of Object.entries(valeur)) {
        const seg = segment(cle);
        pile.push({ valeur: enfant, chemin: chemin === '' ? seg : `${chemin}.${seg}`, genres: genresDeLaCle(cle, service), evenement: ici, relu: 0 });
      }
      continue;
    }
    noter(genres, chemin);
  }
  let lignes = 0;
  let autres = 0;
  for (const { sienne, cadre } of evenements) {
    if (!cadre) continue;
    if (sienne) lignes += 1;
    else autres += 1;
  }
  return { lignes, autres, trouvailles };
}

// ─── The run ───────────────────────────────────────────────────────────────

const REFUS = "Cloudflare refuse la clé, ou elle n'a pas le droit de lire les journaux.";
const ERREUR = 'Cloudflare a répondu une erreur.';
const CACHE = '[message non affiché]';
const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

/** An error, as the run page may name it: its class, never its message. */
const nomErreur = (e) => (e instanceof Error && /^[A-Za-z]{1,40}$/.test(e.name) ? e.name : 'erreur');

/** Cloudflare's own errors: three at most; a message only when it is short, plain, and carries nothing the scan would flag, nor the key or the account. */
function erreurs(liste, secrets) {
  if (!Array.isArray(liste)) return '';
  return liste
    .slice(0, 3)
    .map((e) => {
      const objet = e !== null && typeof e === 'object';
      const code = objet && Number.isInteger(e.code) ? e.code : '?';
      const m = objet ? e.message : undefined;
      const affichable =
        typeof m === 'string' &&
        m.length <= 160 &&
        /^[\x20-\x7E -ſ]*$/.test(m) &&
        genresDuTexte(m).size === 0 &&
        !secrets.some((s) => m.includes(s));
      return ` · code ${code} « ${affichable ? m : CACHE} »`;
    })
    .join('');
}

async function lire(service, { cle, compte, timeframe }) {
  let reponse;
  try {
    reponse = await fetch(`${API}/accounts/${compte}/workers/observability/telemetry/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        view: 'events',
        timeframe,
        limit: PAGE,
        parameters: { filters: [{ key: '$metadata.service', operation: 'eq', type: 'string', value: service }] },
      }),
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch (e) {
    return { nonLu: `Cloudflare n'a pas répondu (${nomErreur(e)})` };
  }
  const texte = await reponse.text().catch(() => null);
  let corps;
  try {
    corps = texte === null ? undefined : JSON.parse(texte);
  } catch {
    corps = undefined;
  }
  const enveloppe = corps !== null && typeof corps === 'object' && !Array.isArray(corps) ? corps : undefined;
  const detail = `(HTTP ${reponse.status}${erreurs(enveloppe?.errors, [cle, compte])})`;
  if (reponse.status < 200 || reponse.status > 299) {
    return { nonLu: `${reponse.status === 401 || reponse.status === 403 ? REFUS : ERREUR} ${detail}` };
  }
  if (enveloppe === undefined) return { nonLu: `La réponse de Cloudflare ne se lit pas. ${detail}` };
  if (enveloppe.success !== true) return { nonLu: `Cloudflare dit que la demande n'a pas abouti. ${detail}` };
  if (enveloppe.result === undefined || enveloppe.result === null) return { nonLu: `La réponse n'a pas la forme attendue. ${detail}` };
  return { scan: scanne(enveloppe.result, service) };
}

function chemins(trouve) {
  const tries = [...trouve.entries()].sort(([a, n], [b, m]) => m - n || (a < b ? -1 : a > b ? 1 : 0));
  const montres = tries.slice(0, 8).map(([chemin, n]) => `${chemin} ×${n}`);
  const reste = tries.length - montres.length;
  if (reste > 0) montres.push(`… et ${reste} ${pluriel(reste, 'autre chemin', 'autres chemins')}`);
  return montres.join(' · ');
}

/** One service's block, and its verdict: OK only when its own lines were read and nothing was found. */
function bloc(service, heures, scan) {
  const tete = `${service} — ${scan.lignes} ${pluriel(scan.lignes, 'ligne lue', 'lignes lues')} (${heures} h)`;
  const autres = scan.autres > 0
    ? ` · ${scan.autres} ${pluriel(scan.autres, "ligne d'un autre service, non comptée", "lignes d'un autre service, non comptées")}`
    : '';
  const sortie = [tete + autres];
  let touches = 0;
  for (const [genre, nom] of GENRES) {
    let total = 0;
    for (const n of scan.trouvailles[genre].values()) total += n;
    touches += total;
    sortie.push(`  ${nom} : ${total}${total > 0 ? `  [${chemins(scan.trouvailles[genre])}]` : ''}`);
  }
  if (touches > 0) return { sortie: [...sortie, '  → À REGARDER'], verdict: 'regarder' };
  if (scan.lignes === 0) {
    const pourquoi = `  → NON LU : aucune ligne lue (rien dans la fenêtre de ${heures} h, ou la réponse n'a pas la forme attendue)`;
    return { sortie: [...sortie, pourquoi], verdict: 'nonLu' };
  }
  return { sortie: [...sortie, '  → OK'], verdict: 'ok' };
}

function arret(phrase) {
  console.error(phrase);
  process.exit(2);
}

async function main() {
  const cle = process.env.CLOUDFLARE_LOGS_TOKEN ?? '';
  if (cle === '') arret('CLOUDFLARE_LOGS_TOKEN manque : la vérification ne peut pas lire les journaux sans sa clé de lecture.');
  const compte = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
  if (compte === '') arret('CLOUDFLARE_ACCOUNT_ID manque : la vérification ne sait pas quel compte lire.');
  // It goes into the URL path: only the account id's own shape may.
  if (!/^[0-9a-f]{32}$/.test(compte)) arret("CLOUDFLARE_ACCOUNT_ID n'a pas la forme d'un identifiant de compte (32 caractères 0-9 a-f).");
  const brut = (process.env.LOG_CHECK_HOURS ?? '').trim();
  const heures = brut === '' ? HEURES : /^[0-9]+$/.test(brut) ? Number(brut) : Number.NaN;
  if (!(Number.isInteger(heures) && heures >= 1 && heures <= HEURES_MAX)) {
    arret(`LOG_CHECK_HOURS doit être un nombre entier d'heures, de 1 à ${HEURES_MAX}.`);
  }
  const liste = (process.env.LOG_CHECK_SERVICES ?? '').trim();
  const services = liste === '' ? SERVICES : liste.split(',').map((s) => s.trim());
  if (services.some((s) => !NOM_WORKER.test(s))) {
    arret("LOG_CHECK_SERVICES : chaque nom doit être celui d'un Worker (minuscules, chiffres et tirets), séparés par des virgules.");
  }

  const maintenant = Date.now();
  const timeframe = { from: maintenant - heures * 3_600_000, to: maintenant };
  const n = services.length;
  console.log(`Vérification des journaux (lecture seule) — ${n} ${pluriel(n, 'service', 'services')}, fenêtre de ${heures} h`);
  const totaux = { ok: 0, regarder: 0, nonLu: 0 };
  for (const service of services) {
    const lu = await lire(service, { cle, compte, timeframe });
    if (lu.nonLu !== undefined) {
      console.log(`${service} — NON LU : ${lu.nonLu}`);
      totaux.nonLu += 1;
      continue;
    }
    const { sortie, verdict } = bloc(service, heures, lu.scan);
    for (const ligne of sortie) console.log(ligne);
    totaux[verdict] += 1;
  }
  console.log(`Bilan : ${n} ${pluriel(n, 'service', 'services')} — OK ${totaux.ok} · À REGARDER ${totaux.regarder} · NON LU ${totaux.nonLu}`);
  console.log("Cette vérification ne fait que lire : rien n'a été changé sur aucun service.");
  process.exitCode = totaux.ok === n ? 0 : 1;
}

// Import-safe: the proof imports the scanner without running this.
const invokedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`La vérification s'est arrêtée (${nomErreur(e)}).`);
    process.exit(1);
  });
}
