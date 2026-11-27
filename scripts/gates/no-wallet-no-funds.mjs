#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { runScanGate } from './scan.mjs';

/**
 * ── THIS GATE IS A TRIPWIRE, NOT A PROOF ───────────────────────────────────
 * Read this before trusting it, and before widening it.
 *
 * It matches VOCABULARY. Two fresh-context verifier rounds defeated earlier
 * versions in both directions at once, because French money vocabulary IS
 * ordinary French vocabulary: « solde » is also a clearance sale, « avoir » is
 * also the verb to have, « en cours » is also "in progress", « retrait » is
 * also a pickup, « dépôt » is also a warehouse, « garantie » is also a
 * warranty, « balance » is also the scales a market seller weighs goods on.
 * Cross that with unbounded synonyms for the money noun AND for the actor and
 * no regex over the product is both leak-free and safe.
 *
 * So this gate catches the OBVIOUS and the ACCIDENTAL. A synonym outside its
 * lists escapes it, by design and on the record. It does NOT establish that no
 * wallet exists. Nothing automated does. That claim rests on review of the
 * persistence layer — a wallet must be PERSISTED to be a wallet, so the
 * question to put to every diff is which stored key accumulates a per-actor
 * amount. Checked by hand across all three repos on 2026-08-06: none does.
 *
 * The priority when tuning is fixed: NEVER break honest work. A gate that cries
 * wolf on « engagement vendeur » or « la balance du marché » teaches everyone
 * to disable gates, and costs more than the leak it closed.
 */

/* Run the gate only when EXECUTED, not when imported. `fr-pattern-coverage`
   imports PATTERNS to prove every one of them is exercised by a fixture; without
   this guard that import would run the gate and exit the coverage process. */
const isMainModule = import.meta.url === pathToFileURL(process.argv[1] ?? '').href;

/**
 * CI gate: no-wallet / no-payment-funds VOCABULARY TRIPWIRE (Ten Laws #2,
 * Séra spec SE-I09: "Séra never computes proceeds, never holds product funds, never marks paid").
 * The law says no wallet/balance module exists anywhere; this file only
 * payment truth. Settlement views read SettlementObligation — never a
 * locally computed balance.
 */
export const PATTERNS = [
    /* UNAMBIGUOUS — no innocent reading in this product. */
    { name: 'wallet', regex: /wallet/i },
    { name: 'balance (english money sense)', regex: /(?<!insufficient_)(?<![a-zA-ZÀ-ÿ])balances?\s*[:=][^=]|\.\s*balances?\b|(seller|user|account|client|vendeur|compte|wallet|cash|credit|fund|payout|ledger|running)Balances?\b|\b(seller|user|account|client|vendeur|compte)_balances?\b/i },
    /* An earner's balance named with its currency (sellerBalanceFcfa,
       seller_balance_xof). `fund` is left out on purpose: the Protection
       Fund's own book is canon (ProtectionFundSchema.balance). */
    { name: 'balance of an earner, with its unit', regex: /(seller|reseller|supplier|rider|courier|vendor|merchant|user|account|client)[_-]?balances?[_-]?(fcfa|xof|amount|cfa)/i },
    { name: 'holdFunds/captureFunds/releaseFunds', regex: /(hold|capture|release)[_-]?funds/i },
    { name: 'escrowAccount', regex: /escrow[_-]?account/i },
    { name: 'topUp', regex: /top[_-]?up\b/i },
    { name: 'withdrawal', regex: /withdraw/i },
    { name: 'cagnotte / porte-monnaie / tirelire (fr)', regex: /(cagnotte|porte[_-]?monnaie|tirelire)/i },
    { name: 'créditer/débiter (fr)', regex: /(?<![a-zA-ZÀ-ÿ])(cr[ée]diter|d[ée]biter)/i },
    { name: 'approvisionner/recharger un compte (fr)', regex: /(approvisionn|recharg)\w*[_-]?(le[_-]?|la[_-]?)?(compte|solde|portefeuille)/i },

    /* ACTOR-BOUND — a money noun attached to a person or an account. The actor
       list is deliberately WIDE; it is still a list, and a synonym outside it
       escapes. That is a known and accepted limit — see the header. */
    { name: 'money noun bound to an actor (fr)', regex: /(solde|portefeuille|cr[ée]dit|fonds|[ée]pargne|tr[ée]sorerie|cr[ée]ance|ardoise|cagnotte|tirelire)s?\w{0,12}(vendeur|vendeuse|revendeur|revendeuse|fournisseur|marchand|commer[cç]ant|grossiste|boutique|g[ée]rant|agent|membre|b[ée]n[ée]ficiaire|livreur|coursier|client|cliente|utilisateur|compte)/i },
    { name: 'actor carrying a money noun (fr)', regex: /(vendeur|vendeuse|revendeur|revendeuse|fournisseur|marchand|commer[cç]ant|grossiste|boutique|g[ée]rant|agent|membre|b[ée]n[ée]ficiaire|livreur|coursier|client|cliente|utilisateur|compte)\w{0,12}(solde|portefeuille|cr[ée]dit|fonds|[ée]pargne|tr[ée]sorerie|cr[ée]ance|ardoise|cagnotte|tirelire)\b/i },
    { name: 'money noun accumulated (fr)', regex: /(?<![a-zA-ZÀ-ÿ])(solde|portefeuille|cr[ée]dit|fonds|[ée]pargne|tr[ée]sorerie|cr[ée]ance|ardoise|cagnotte|tirelire)\w*\s*[+-]=/i },
    { name: 'money noun assigned as a member (fr)', regex: /(?:\.|\[\s*["'])(solde|portefeuille|cr[ée]dit|fonds|[ée]pargne|tr[ée]sorerie|cr[ée]ance|ardoise|cagnotte|tirelire)\b["']?\s*\]?\s*[+-]?=/i },
    { name: 'money noun as a JSON key (fr)', regex: /["'](solde|portefeuille|cr[ée]dit|fonds|[ée]pargne|tr[ée]sorerie|cr[ée]ance|ardoise|cagnotte|tirelire)["']\s*:\s*[0-9-]/i },
];

/**
 * RULED CARVE-OUTS (2026-11-27). The Protection Fund is a fund with a book of
 * its own, and the canon names that book's balance (§9.2 Desk 1; canon
 * ProtectionFundSchema.balance, « platform-funded; sellers never
 * contribute »). Each entry excuses ONE exact trimmed line, for ONE pattern,
 * in ONE file, and is printed on every run. Any other line in the same file
 * still fails — a seller's balance planted beside the fund's own is caught
 * (the board proves it on a copy of one of these files). An edited line
 * loses its excuse until it is ruled again.
 */
const FUND_BOOK = "the Protection Fund's own declared balance (§9.2 Desk 1; canon ProtectionFundSchema.balance)";
const NO_SELLER_BALANCE_TEST = 'a test asserting no seller-balance key exists';
const ALLOW = [
  { file: 'apps/ops-console/e2e/fonds-live.spec.ts', pattern: 'balance (english money sense)', line: '// ── declare the balance: both money fields refuse what is not digits ───', ruling: FUND_BOOK },
  { file: 'apps/ops-console/i18n/catalog.json', pattern: 'balance (english money sense)', line: '"key": "fonds.balance",', ruling: FUND_BOOK },
  { file: 'apps/ops-console/src/fonds/live.ts', pattern: 'balance (english money sense)', line: "const balance = moneyInput('solde', 'fonds.declare_balance');", ruling: FUND_BOOK },
  { file: 'apps/ops-console/src/fonds/sandbox.ts', pattern: 'balance (english money sense)', line: 'const SANDBOX_BALANCE = 100_000;', ruling: FUND_BOOK },
  { file: 'apps/ops-console/src/fonds/view.ts', pattern: 'balance (english money sense)', line: "'fonds.balance',", ruling: FUND_BOOK },
  { file: 'services/protection-service/test/fund-book.e2e.test.ts', pattern: 'balance (english money sense)', line: "for (const forbidden of ['sellerbalance', 'debit', 'reserve', 'deposit', 'caution']) {", ruling: NO_SELLER_BALANCE_TEST },
];

if (isMainModule) {
    runScanGate({
      gateName: 'no-wallet-no-funds',
    invariant: 'Ten Laws #2 — no app holds funds; no wallet/balance module',
    patterns: PATTERNS,
    allow: ALLOW,
  });
}

