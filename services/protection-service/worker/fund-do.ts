/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * FondsDO — THE PROTECTION FUND BOOK (FONDS-1). One singleton instance
 * (`idFromName(FONDS_BOOK_NAME)`), durably holding every Protection Fund claim
 * and every dated fund declaration the founder records.
 *
 * SPEC AUTHORITY (quoted; full quotes in ../src/fund-core.ts):
 *  · §9.2 Desk 1 — claims by faultClass; solvency; capitalization. B+I-13:
 *    « buyer refunds are NEVER gated on the fund's solvency. »
 *  · §9.2 Desk 2 — Séra fault → CustodyLiabilityClaim, « separate from the
 *    fund » — refused here BY NAME.
 *  · §9.1 — « Every ops action is a permissioned, evented, audited command. »
 *    Every mutation appends a journal row (who/what/when/entity/detail);
 *    nothing here can be edited or deleted. The three canon event names this
 *    book may use exist in EVENT_NAMES (`protection.claim_opened.v1`,
 *    `protection.capitalized.v1`, `protection.solvency_changed.v1`) — no
 *    event name is invented.
 *
 * ═══ WHAT THIS OBJECT NEVER DOES (named, tested) ═══
 *  · MOVES NO MONEY. Founder ruling 2026-08-06: fund money moves OFFLINE.
 *    `resolved` requires a `settlementRef` — the reference of a payment that
 *    already happened outside — never a disbursement from here (Ten Laws #2).
 *  · GATES NO REFUND. B+I-13: the seller-fault refund-required record (its
 *    `buyerPriority: true` is literal-typed in the reference implementation)
 *    is written on claim open REGARDLESS of fund solvency — there is no code
 *    path from solvency to the refund record, and the e2e proves it at
 *    CRITICAL.
 *  · DEBITS NO SELLER. B+I-12. No seller balance exists anywhere here.
 *
 * ═══ WHAT A READING COSTS (bounded, whatever the history) ═══
 *  · The committed amount is a RUNNING TOTAL (`total:committed`), moved by the
 *    same policy function (computeCommittedClaimsAmount) applied to the one
 *    claim a write changes, inside the SAME atomic write as that change — so
 *    it can never drift from the claims it sums. It records the policy basis
 *    it was kept under; a total kept under any other basis is rebuilt, never
 *    trusted.
 *  · `open:<orderId>` holds every non-terminal claim; `closed:<n>` numbers
 *    terminal claims in closing order, assigned in the closing write. The
 *    desk reads the open set whole and the closed ones a page at a time.
 *  · A book written before these existed is built ONCE, by its first reading
 *    that needs them, in one transaction that also writes a `build:<n>`
 *    record of what it did. History rows are never edited or deleted.
 *
 * ═══ NAMED DEBTS (journalled) ═══
 *  · MAKER-CHECKER (§9.1 « maker-checker on anything touching money or
 *    custody ») is DEFERRED: the founder is today the sole operator, so a
 *    second-identity approval would be theater or a dead end. Mitigations
 *    until a second ops identity exists: nothing moves a franc (declarations
 *    are recorded external facts), every write is append-only + journalled,
 *    declarations keep full history (never overwrite).
 *  · ACTOR IDENTITY: the ops secret is the founder's alone, so `actor` is the
 *    constant `ops:protection:fondateur` — honest today, to be replaced by a
 *    real operator identity when one exists.
 */

import { ProtectionClaimSchema, type ProtectionClaim } from '@platform/contracts';
import {
  FUND_COMMITMENT_POLICY_V1,
  PROTECTION_CLAIM_STATES_V2,
  TERMINAL_CLAIM_STATES,
  computeCommittedClaimsAmount,
  deriveSolvency,
  isClaimState,
  isForwardStep,
  isFundAdmissibleFaultClass,
  type ClaimState,
} from '../src/fund-core.js';

export const FONDS_BOOK_NAME = 'fonds-de-protection';
export const FONDS_ACTOR = 'ops:protection:fondateur';

const CLAIM_PREFIX = 'claim:';
const DECL_PREFIX = 'decl:';
const JOURNAL_PREFIX = 'journal:';
const SEQ_DECL = 'seq:decl';
const SEQ_JOURNAL = 'seq:journal';
const CONSUMED_PREFIX = 'consumed:';
const LAST_SOLVENCY = 'solvency:last';
const TOTAL = 'total:committed';
const OPEN_PREFIX = 'open:';
const CLOSED_PREFIX = 'closed:';
const SEQ_CLOSED = 'seq:closed';
const BUILD_PREFIX = 'build:';
const SEQ_BUILD = 'seq:build';
/** Storage's batch limit: at most 128 keys per multi-key get or put. */
const BATCH = 128;
const PAGE_DEFAULT = 20;
/** Under BATCH, so one page's claims are read in a single get. */
const PAGE_MAX = 100;

/** The basis a running total is kept under: change any part of it and the
 * stored total no longer means the same thing, so it is rebuilt. */
const COMMITMENT_BASIS = {
  policyVersion: FUND_COMMITMENT_POLICY_V1.version,
  countsTowardCommitted: FUND_COMMITMENT_POLICY_V1.countsTowardCommitted,
  terminalStates: TERMINAL_CLAIM_STATES,
};

interface CommittedTotal {
  readonly amountFcfa: number;
  readonly policyVersion: string;
  readonly countsTowardCommitted: Record<string, boolean>;
  readonly terminalStates: readonly string[];
}

type BuildReason = 'no_total' | 'policy_changed';

/** B+I-13 trigger record — mirrors the reference's RefundRequiredRecord: the
 * `buyerPriority: true` marker E3's refund executor must honor. INPUT-COPIED
 * amount, never computed. */
interface RefundRequiredRecord {
  readonly orderId: string;
  readonly reason: string;
  readonly faultClass: 'seller';
  readonly buyerPriority: true;
  readonly amountFcfa: number;
  readonly recordedAt: string;
}

interface AdvanceRecord {
  readonly to: ClaimState;
  readonly at: string;
  readonly by: string;
  /** Present iff to === 'resolved': the offline payment's reference. */
  readonly settlementRef?: string;
  /** Present iff to === 'closed_no_payout': why nothing is owed by the fund. */
  readonly closedReason?: string;
}

interface StoredClaim {
  readonly claim: ProtectionClaim;
  readonly openedAt: string;
  readonly openedBy: string;
  readonly refundRequired?: RefundRequiredRecord;
  readonly advanced: readonly AdvanceRecord[];
}

interface Declaration {
  readonly seq: number;
  readonly balanceFcfa: number;
  readonly openingFundCapitalFcfa?: number;
  readonly declaredAt: string;
  readonly declaredBy: string;
  readonly note?: string;
}

interface JournalRow {
  readonly seq: number;
  /** Canon EVENT_NAMES member where one exists; otherwise a local ops action
   * name (the quarantined-local-union ruling, 2026-07-13 — canon names no
   * ops-command event and forbids inventing event names). */
  readonly action: string;
  readonly actor: string;
  readonly at: string;
  readonly entity: string;
  readonly detail: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFcfaAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function pad(n: number): string {
  return String(n).padStart(8, '0');
}

function isTerminal(state: string): boolean {
  return (TERMINAL_CLAIM_STATES as readonly string[]).includes(state);
}

/** What one claim adds to the committed amount — the policy function itself,
 * never a second formula. */
function contribution(claim: ProtectionClaim): number {
  return computeCommittedClaimsAmount([{ amount: claim.amount, state: claim.state, faultClass: claim.faultClass }]);
}

function totalOf(amountFcfa: number): CommittedTotal {
  return { amountFcfa, ...COMMITMENT_BASIS };
}

function keptUnderThisBasis(t: CommittedTotal | undefined): t is CommittedTotal {
  if (t === undefined) return false;
  const basis = { policyVersion: t.policyVersion, countsTowardCommitted: t.countsTowardCommitted, terminalStates: t.terminalStates };
  return JSON.stringify(basis) === JSON.stringify(COMMITMENT_BASIS);
}

const DIGITS = /^\d{1,15}$/;

/** A page request: `limit` 1–100 (default 20), `before` ≥ 1 when given;
 * null when either is malformed. */
function readPage(params: URLSearchParams): { limit: number; before: number | undefined } | null {
  const rawLimit = params.get('limit');
  const rawBefore = params.get('before');
  const limit = rawLimit === null ? PAGE_DEFAULT : DIGITS.test(rawLimit) ? Number(rawLimit) : NaN;
  const before = rawBefore === null ? undefined : DIGITS.test(rawBefore) ? Number(rawBefore) : NaN;
  if (!(limit >= 1 && limit <= PAGE_MAX)) return null;
  if (before !== undefined && !(before >= 1)) return null;
  return { limit, before };
}

const INVALID_PAGE = { error: 'invalid_page' } as const;

export class FondsDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === 'POST' && path === '/claims') return this.openClaim(request);
    const advanceMatch = /^\/claims\/([^/]+)\/advance$/.exec(path);
    if (method === 'POST' && advanceMatch !== null) {
      return this.advanceClaim(decodeURIComponent(advanceMatch[1] as string), request);
    }
    if (method === 'GET' && path === '/claims') return this.listClaims(url);
    if (method === 'PUT' && path === '/fund') return this.declareFund(request);
    if (method === 'GET' && path === '/fund') return this.fundView();
    if (method === 'GET' && path === '/journal') return this.journalView(url);
    return json({ error: 'not_found' }, 404);
  }

  // ── claims ────────────────────────────────────────────────────────────────

  private async openClaim(request: Request): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainObject(body)) return json({ error: 'invalid_body' }, 400);
    const { orderId, reason, faultClass, amountFcfa, evidenceBundleId } = body;
    if (!isNonEmptyString(orderId) || !isNonEmptyString(reason) || !isNonEmptyString(evidenceBundleId)) {
      return json({ error: 'invalid_body' }, 400);
    }
    if (!isFcfaAmount(amountFcfa)) return json({ error: 'invalid_amount' }, 400);
    // A claim that owes nothing is closed without payout, never opened: a
    // 0-franc claim in an append-only book is a money record nobody can undo.
    if (amountFcfa === 0) return json({ error: 'zero_claim_amount' }, 400);
    if (faultClass === 'sera') {
      // Desk 2 routing: « Séra fault → CustodyLiabilityClaim — Séra's own
      // instrument, separate from the fund. » Refused by name, with the
      // instrument the caller should use.
      return json({ error: 'not_a_fund_claim', instrument: 'custody_liability_claim' }, 422);
    }
    if (!isFundAdmissibleFaultClass(faultClass)) return json({ error: 'invalid_fault_class' }, 400);

    // One trimmed id everywhere — the storage key, the dedupe, and the canon
    // parse must agree on identity or a padded id becomes a second claim.
    const id = orderId.trim();
    const key = `${CLAIM_PREFIX}${id}`;
    const existing = await this.state.storage.get<StoredClaim>(key);
    if (existing !== undefined) {
      // One claim per order — first-wins, the reference's Map-keyed law.
      return json({ error: 'duplicate', claim: existing.claim }, 409);
    }

    // Canon-parsed — a malformed claim never lands in storage. Guarded: an
    // input passing the manual checks but failing canon's stricter shapes
    // (e.g. a trailing space in an id) answers a 400, never a 500 with Zod
    // internals on the wire (verifier round 1, note 3).
    let claim: ProtectionClaim;
    try {
      claim = ProtectionClaimSchema.parse({
        orderId: id,
        reason: reason.trim(),
        amount: amountFcfa,
        faultClass,
        evidenceBundleId: evidenceBundleId.trim(),
        state: PROTECTION_CLAIM_STATES_V2.states[0],
      });
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }

    const now = new Date().toISOString();
    // B+I-13: written UNCONDITIONALLY for seller fault — no read of fund
    // state, no solvency branch, on ANY path to this record.
    const refundRequired: RefundRequiredRecord | undefined =
      faultClass === 'seller'
        ? {
            orderId: id,
            reason: claim.reason,
            faultClass: 'seller',
            buyerPriority: true,
            amountFcfa,
            recordedAt: now,
          }
        : undefined;

    const stored: StoredClaim = {
      claim,
      openedAt: now,
      openedBy: FONDS_ACTOR,
      ...(refundRequired !== undefined ? { refundRequired } : {}),
      advanced: [],
    };
    // Read first: a first build may raise the journal counter read below.
    const committed = await this.committedTotal();
    // ONE atomic write: the claim, its refund record, its journal row, its
    // place in the open set and the total it moves land together or not at
    // all — a claim without its history would be refused as a duplicate on
    // retry and never get it (§9.1, Desk 8).
    await this.state.storage.put({
      [key]: stored,
      [`${OPEN_PREFIX}${id}`]: true,
      [TOTAL]: totalOf(committed + contribution(claim)),
      ...(await this.journalEntries([
        {
          action: 'protection.claim_opened.v1',
          entity: id,
          detail: { faultClass, amountFcfa, evidenceBundleId, refundRequired: refundRequired !== undefined },
        },
      ])),
    });
    return json({ ok: true, claim, refundRequired: refundRequired ?? null }, 201);
  }

  private async advanceClaim(orderId: string, request: Request): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainObject(body)) return json({ error: 'invalid_body' }, 400);
    const { to, settlementRef, closedReason } = body;
    if (!isClaimState(to)) return json({ error: 'invalid_state' }, 400);

    const key = `${CLAIM_PREFIX}${orderId}`;
    const stored = await this.state.storage.get<StoredClaim>(key);
    if (stored === undefined) return json({ error: 'claim_unknown' }, 404);

    const from = stored.claim.state as ClaimState;
    if (!isForwardStep(from, to)) return json({ error: 'not_forward', from, to }, 409);
    if (to === 'resolved' && !isNonEmptyString(settlementRef)) {
      // The offline-money link: a claim is resolved ONLY against the
      // reference of a payment the founder already made outside.
      return json({ error: 'settlement_ref_required' }, 400);
    }
    if (to === 'closed_no_payout' && !isNonEmptyString(closedReason)) {
      // The no-payout exit (verifier round 1): closing demands the stated
      // WHY — « la cliente a renoncé », « dossier de garde Séra », … — so the
      // audit book never carries a fabricated payment reference and never
      // carries a silent close either.
      return json({ error: 'close_reason_required' }, 400);
    }

    const now = new Date().toISOString();
    const advance: AdvanceRecord = {
      to,
      at: now,
      by: FONDS_ACTOR,
      ...(to === 'resolved' ? { settlementRef: (settlementRef as string).trim() } : {}),
      ...(to === 'closed_no_payout' ? { closedReason: (closedReason as string).trim() } : {}),
    };
    let nextClaim: ProtectionClaim;
    try {
      nextClaim = ProtectionClaimSchema.parse({ ...stored.claim, state: to });
    } catch {
      return json({ error: 'invalid_body' }, 400);
    }
    const next: StoredClaim = {
      ...stored,
      claim: nextClaim,
      advanced: [...stored.advanced, advance],
    };
    // Read first: a first build may raise the counters read below.
    const committed = await this.committedTotal();
    const total = totalOf(committed - contribution(stored.claim) + contribution(nextClaim));
    const journal = await this.journalEntries([
      {
        action: 'claim:advance',
        entity: orderId,
        detail: {
          from,
          to,
          ...(advance.settlementRef !== undefined ? { settlementRef: advance.settlementRef } : {}),
          ...(advance.closedReason !== undefined ? { closedReason: advance.closedReason } : {}),
        },
      },
    ]);
    if (isTerminal(to)) {
      // Leaving the open set is a delete, which a batch put cannot carry: one
      // transaction holds the step, its journal row, its total, its closing
      // number and the delete, together or not at all.
      const closedSeq = ((await this.state.storage.get<number>(SEQ_CLOSED)) ?? 0) + 1;
      await this.state.storage.transaction(async (txn) => {
        await txn.put({
          [key]: next,
          [TOTAL]: total,
          [`${CLOSED_PREFIX}${pad(closedSeq)}`]: orderId,
          [SEQ_CLOSED]: closedSeq,
          ...journal,
        });
        await txn.delete(`${OPEN_PREFIX}${orderId}`);
      });
    } else {
      // ONE atomic write: the step, its journal row and its total.
      await this.state.storage.put({ [key]: next, [TOTAL]: total, ...journal });
    }
    return json({ ok: true, state: to });
  }

  private async listClaims(url: URL): Promise<Response> {
    const part = url.searchParams.get('part');
    if (part === null) {
      // The full answer, unchanged for any reader that has not moved to pages.
      const rows = await this.state.storage.list<StoredClaim>({ prefix: CLAIM_PREFIX });
      const claims = [...rows.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
      return json({ claims });
    }
    if (part === 'open') {
      // Every open claim, always whole: one is never hidden behind a page.
      if (url.searchParams.has('limit') || url.searchParams.has('before')) return json(INVALID_PAGE, 400);
      return json({ claims: await this.openClaims() });
    }
    if (part !== 'closed') return json(INVALID_PAGE, 400);
    const page = readPage(url.searchParams);
    if (page === null) return json(INVALID_PAGE, 400);
    await this.committedTotal(); // the indexes exist once the total does
    const index = await this.state.storage.list<string>({
      prefix: CLOSED_PREFIX,
      reverse: true,
      limit: page.limit,
      ...(page.before !== undefined ? { end: `${CLOSED_PREFIX}${pad(page.before)}` } : {}),
    });
    const entries = [...index];
    const keys = entries.map(([, id]) => `${CLAIM_PREFIX}${id}`);
    const got = keys.length > 0 ? await this.state.storage.get<StoredClaim>(keys) : new Map<string, StoredClaim>();
    const claims = keys.map((k) => got.get(k) as StoredClaim);
    const last = entries[entries.length - 1];
    // Closing numbers are contiguous from 1, so an oldest above 1 means older ones exist.
    const oldest = last === undefined ? 0 : Number(last[0].slice(CLOSED_PREFIX.length));
    return json({ claims, nextBefore: oldest > 1 ? oldest : null });
  }

  /** Every non-terminal claim, in the full answer's order (openedAt, stable
   * over key order). */
  private async openClaims(): Promise<StoredClaim[]> {
    await this.committedTotal(); // the indexes exist once the total does
    const keys = [...(await this.state.storage.list({ prefix: OPEN_PREFIX })).keys()].map(
      (k) => `${CLAIM_PREFIX}${k.slice(OPEN_PREFIX.length)}`,
    );
    const claims: StoredClaim[] = [];
    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      const got = await this.state.storage.get<StoredClaim>(batch);
      for (const k of batch) claims.push(got.get(k) as StoredClaim);
    }
    return claims.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }

  // ── fund declarations ─────────────────────────────────────────────────────

  private async declareFund(request: Request): Promise<Response> {
    const body: unknown = await request.json().catch(() => null);
    if (!isPlainObject(body)) return json({ error: 'invalid_body' }, 400);
    const { commandId, balanceFcfa, openingFundCapitalFcfa, note } = body;
    if (!isNonEmptyString(commandId)) return json({ error: 'command_id_required' }, 400);
    if (!isFcfaAmount(balanceFcfa)) return json({ error: 'invalid_amount' }, 400);
    if (openingFundCapitalFcfa !== undefined && !isFcfaAmount(openingFundCapitalFcfa)) {
      return json({ error: 'invalid_amount' }, 400);
    }
    if (note !== undefined && typeof note !== 'string') return json({ error: 'invalid_body' }, 400);

    const consumedKey = `${CONSUMED_PREFIX}${commandId}`;
    if ((await this.state.storage.get<boolean>(consumedKey)) === true) {
      return json({ ok: true, duplicate: true });
    }

    // Read first: a first build may raise the declaration counter read below.
    const committed = await this.committedTotal();
    const seq = ((await this.state.storage.get<number>(SEQ_DECL)) ?? 0) + 1;
    const now = new Date().toISOString();
    const declaration: Declaration = {
      seq,
      balanceFcfa,
      ...(openingFundCapitalFcfa !== undefined ? { openingFundCapitalFcfa } : {}),
      declaredAt: now,
      declaredBy: FONDS_ACTOR,
      ...(isNonEmptyString(note) ? { note: note.trim() } : {}),
    };
    // This declaration is the latest once written, so the solvency it moves
    // the fund to is derived from it here — the same arithmetic GET /fund runs.
    const solvency = deriveSolvency(balanceFcfa, committed);
    const last = await this.state.storage.get<string>(LAST_SOLVENCY);
    const solvencyChanged = solvency.state !== null && solvency.state !== last;

    // Every declaration journals as the LOCAL action; the canon name
    // `protection.capitalized.v1` is reserved for the act it names — opening
    // capital being declared — never a routine (possibly declining) balance
    // reading (verifier round 1, note 7).
    const journal = await this.journalEntries([
      {
        action: 'fund:declare',
        entity: FONDS_BOOK_NAME,
        detail: { balanceFcfa, ...(openingFundCapitalFcfa !== undefined ? { openingFundCapitalFcfa } : {}) },
      },
      ...(openingFundCapitalFcfa !== undefined
        ? [{ action: 'protection.capitalized.v1', entity: FONDS_BOOK_NAME, detail: { openingFundCapitalFcfa, balanceFcfa } }]
        : []),
      ...(solvencyChanged
        ? [{ action: 'protection.solvency_changed.v1', entity: FONDS_BOOK_NAME, detail: { from: last ?? null, to: solvency.state } }]
        : []),
    ]);
    // Append-only: a new declaration NEVER overwrites history — the figure's
    // full trail is the maker-checker debt's standing mitigation. ONE atomic
    // write: the declaration, its sequence, its replay receipt and its journal
    // rows land together or not at all, so a retry can neither double nor
    // overwrite it.
    await this.state.storage.put({
      [`${DECL_PREFIX}${String(seq).padStart(8, '0')}`]: declaration,
      [SEQ_DECL]: seq,
      [consumedKey]: true,
      ...(solvencyChanged ? { [LAST_SOLVENCY]: solvency.state } : {}),
      ...journal,
    });
    return json({ ok: true, declaration, solvency }, 201);
  }

  private async fundView(): Promise<Response> {
    let head = await this.state.storage.get<unknown>([SEQ_DECL, TOTAL]);
    if (!keptUnderThisBasis(head.get(TOTAL) as CommittedTotal | undefined)) {
      await this.committedTotalFrom(head.get(TOTAL) as CommittedTotal | undefined);
      head = await this.state.storage.get<unknown>([SEQ_DECL, TOTAL]); // the build may raise the counter
    }
    const committed = (head.get(TOTAL) as CommittedTotal).amountFcfa;
    // Declarations are numbered 1..seq with no gap (see buildIndexes), so the
    // counter IS the count and names the latest row.
    const count = (head.get(SEQ_DECL) as number | undefined) ?? 0;
    const latest = count > 0 ? ((await this.state.storage.get<Declaration>(`${DECL_PREFIX}${pad(count)}`)) ?? null) : null;
    const solvency = deriveSolvency(latest === null ? null : latest.balanceFcfa, committed);
    return json({
      declaration: latest,
      declarationCount: count,
      committedClaimsAmountFcfa: committed,
      solvency,
      // §12 ⏳ named honestly on the wire, so no consumer mistakes the
      // two-state derivation for the real sizing formula.
      solvencyNote:
        'WATCH/RESTRICTED indisponibles — la formule de dimensionnement (⏳ §12) attend la décision du fondateur.',
    });
  }

  private async journalView(url: URL): Promise<Response> {
    if (!url.searchParams.has('limit') && !url.searchParams.has('before')) {
      // The full answer, unchanged for any reader that has not moved to pages.
      const rows = await this.state.storage.list<JournalRow>({ prefix: JOURNAL_PREFIX });
      const journal = [...rows.values()].sort((a, b) => a.seq - b.seq);
      return json({ journal });
    }
    const page = readPage(url.searchParams);
    if (page === null) return json(INVALID_PAGE, 400);
    const rows = await this.state.storage.list<JournalRow>({
      prefix: JOURNAL_PREFIX,
      reverse: true,
      limit: page.limit,
      ...(page.before !== undefined ? { end: `${JOURNAL_PREFIX}${pad(page.before)}` } : {}),
    });
    const journal = [...rows.values()];
    const oldest = journal[journal.length - 1]?.seq ?? 0;
    return json({ journal, nextBefore: oldest > 1 ? oldest : null });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** The running total under this release's basis, built from the rows once
   * when absent or kept under another basis. */
  private async committedTotal(): Promise<number> {
    return this.committedTotalFrom(await this.state.storage.get<CommittedTotal>(TOTAL));
  }

  private async committedTotalFrom(stored: CommittedTotal | undefined): Promise<number> {
    if (stored === undefined) return this.buildIndexes('no_total');
    if (!keptUnderThisBasis(stored)) return this.buildIndexes('policy_changed');
    return stored.amountFcfa;
  }

  /**
   * The one-time build: the total, the open set and the closing numbers, from
   * the claims as stored, in ONE transaction with a `build:<n>` record of
   * what it did. Closed claims are numbered in the order of their terminal
   * step (ties by orderId).
   *
   * Counters: writes before every fund write was atomic stored a row first
   * and its counter after, so an interrupted one can leave a declaration or
   * journal row one ahead of its counter — never a counter ahead of its row,
   * never a gap. The build raises such a counter to the highest row present,
   * so the counter stays the count, the next write never overwrites that
   * row, and the reading matches the full list it replaces. No row is
   * touched.
   */
  private async buildIndexes(reason: BuildReason): Promise<number> {
    const storage = this.state.storage;
    const rows = [...(await storage.list<StoredClaim>({ prefix: CLAIM_PREFIX }))].map(
      ([k, s]) => [k.slice(CLAIM_PREFIX.length), s] as const,
    );
    const amountFcfa = computeCommittedClaimsAmount(
      rows.map(([, s]) => ({ amount: s.claim.amount, state: s.claim.state, faultClass: s.claim.faultClass })),
    );
    const closedAt = (s: StoredClaim) => s.advanced[s.advanced.length - 1]?.at ?? s.openedAt;
    const open = rows.filter(([, s]) => !isTerminal(s.claim.state));
    const closed = rows
      .filter(([, s]) => isTerminal(s.claim.state))
      .sort(([a, sa], [b, sb]) => closedAt(sa).localeCompare(closedAt(sb)) || (a < b ? -1 : a > b ? 1 : 0));

    const counters: Record<string, { before: number; after: number }> = {};
    const raised: Record<string, number> = {};
    for (const [seqKey, prefix] of [
      [SEQ_DECL, DECL_PREFIX],
      [SEQ_JOURNAL, JOURNAL_PREFIX],
    ] as const) {
      const before = (await storage.get<number>(seqKey)) ?? 0;
      const top = [...(await storage.list({ prefix, reverse: true, limit: 1 })).keys()][0];
      const after = Math.max(before, top === undefined ? 0 : Number(top.slice(prefix.length)));
      counters[seqKey] = { before, after };
      if (after !== before) raised[seqKey] = after;
    }

    const buildSeq = ((await storage.get<number>(SEQ_BUILD)) ?? 0) + 1;
    const entries: Record<string, unknown> = {
      [TOTAL]: totalOf(amountFcfa),
      [SEQ_CLOSED]: closed.length,
      [`${BUILD_PREFIX}${pad(buildSeq)}`]: {
        at: new Date().toISOString(),
        reason,
        claims: rows.length,
        open: open.length,
        closed: closed.length,
        committedAmountFcfa: amountFcfa,
        policyVersion: FUND_COMMITMENT_POLICY_V1.version,
        counters,
      },
      [SEQ_BUILD]: buildSeq,
      ...raised,
    };
    for (const [id] of open) entries[`${OPEN_PREFIX}${id}`] = true;
    closed.forEach(([id], i) => {
      entries[`${CLOSED_PREFIX}${pad(i + 1)}`] = id;
    });
    // Index rows from a build under another basis that this one does not rewrite.
    const stale = [
      ...(await storage.list({ prefix: OPEN_PREFIX })).keys(),
      ...(await storage.list({ prefix: CLOSED_PREFIX })).keys(),
    ].filter((k) => !(k in entries));

    const all = Object.entries(entries);
    await storage.transaction(async (txn) => {
      for (const k of stale) await txn.delete(k);
      for (let i = 0; i < all.length; i += BATCH) await txn.put(Object.fromEntries(all.slice(i, i + BATCH)));
    });
    return amountFcfa;
  }

  /** Journal rows numbered after the stored sequence, with the new sequence —
   * never written alone: the caller puts them in the SAME atomic write as the
   * change they record. */
  private async journalEntries(
    rows: ReadonlyArray<{ action: string; entity: string; detail: Record<string, unknown> }>,
  ): Promise<Record<string, unknown>> {
    const last = (await this.state.storage.get<number>(SEQ_JOURNAL)) ?? 0;
    const at = new Date().toISOString();
    const entries: Record<string, unknown> = { [SEQ_JOURNAL]: last + rows.length };
    rows.forEach(({ action, entity, detail }, i) => {
      const seq = last + i + 1;
      const row: JournalRow = { seq, action, actor: FONDS_ACTOR, at, entity, detail };
      entries[`${JOURNAL_PREFIX}${String(seq).padStart(8, '0')}`] = row;
    });
    return entries;
  }
}
