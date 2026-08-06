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
  PROTECTION_CLAIM_STATES_V2,
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
    if (method === 'GET' && path === '/claims') return this.listClaims();
    if (method === 'PUT' && path === '/fund') return this.declareFund(request);
    if (method === 'GET' && path === '/fund') return this.fundView();
    if (method === 'GET' && path === '/journal') return this.journalView();
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
    await this.state.storage.put(key, stored);
    await this.appendJournal('protection.claim_opened.v1', id, {
      faultClass,
      amountFcfa,
      evidenceBundleId,
      refundRequired: refundRequired !== undefined,
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
    await this.state.storage.put(key, next);
    await this.appendJournal('claim:advance', orderId, {
      from,
      to,
      ...(advance.settlementRef !== undefined ? { settlementRef: advance.settlementRef } : {}),
      ...(advance.closedReason !== undefined ? { closedReason: advance.closedReason } : {}),
    });
    return json({ ok: true, state: to });
  }

  private async listClaims(): Promise<Response> {
    const rows = await this.state.storage.list<StoredClaim>({ prefix: CLAIM_PREFIX });
    const claims = [...rows.values()].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    return json({ claims });
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
    // Append-only: a new declaration NEVER overwrites history — the figure's
    // full trail is the maker-checker debt's standing mitigation.
    await this.state.storage.put(`${DECL_PREFIX}${String(seq).padStart(8, '0')}`, declaration);
    await this.state.storage.put(SEQ_DECL, seq);
    await this.state.storage.put(consumedKey, true);
    // Every declaration journals as the LOCAL action; the canon name
    // `protection.capitalized.v1` is reserved for the act it names — opening
    // capital being declared — never a routine (possibly declining) balance
    // reading (verifier round 1, note 7).
    await this.appendJournal('fund:declare', FONDS_BOOK_NAME, {
      balanceFcfa,
      ...(openingFundCapitalFcfa !== undefined ? { openingFundCapitalFcfa } : {}),
    });
    if (openingFundCapitalFcfa !== undefined) {
      await this.appendJournal('protection.capitalized.v1', FONDS_BOOK_NAME, {
        openingFundCapitalFcfa,
        balanceFcfa,
      });
    }

    const solvency = await this.currentSolvency();
    const last = await this.state.storage.get<string>(LAST_SOLVENCY);
    if (solvency.state !== null && solvency.state !== last) {
      await this.state.storage.put(LAST_SOLVENCY, solvency.state);
      await this.appendJournal('protection.solvency_changed.v1', FONDS_BOOK_NAME, {
        from: last ?? null,
        to: solvency.state,
      });
    }
    return json({ ok: true, declaration, solvency }, 201);
  }

  private async fundView(): Promise<Response> {
    const decls = await this.state.storage.list<Declaration>({ prefix: DECL_PREFIX });
    const history = [...decls.values()].sort((a, b) => a.seq - b.seq);
    const latest = history.length > 0 ? (history[history.length - 1] as Declaration) : null;
    const solvency = await this.currentSolvency();
    const committed = await this.committedClaimsAmount();
    return json({
      declaration: latest,
      declarationCount: history.length,
      committedClaimsAmountFcfa: committed,
      solvency,
      // §12 ⏳ named honestly on the wire, so no consumer mistakes the
      // two-state derivation for the real sizing formula.
      solvencyNote:
        'WATCH/RESTRICTED indisponibles — la formule de dimensionnement (⏳ §12) attend la décision du fondateur.',
    });
  }

  private async journalView(): Promise<Response> {
    const rows = await this.state.storage.list<JournalRow>({ prefix: JOURNAL_PREFIX });
    const journal = [...rows.values()].sort((a, b) => a.seq - b.seq);
    return json({ journal });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private async committedClaimsAmount(): Promise<number> {
    const rows = await this.state.storage.list<StoredClaim>({ prefix: CLAIM_PREFIX });
    return computeCommittedClaimsAmount(
      [...rows.values()].map((s) => ({ amount: s.claim.amount, state: s.claim.state })),
    );
  }

  private async currentSolvency() {
    const decls = await this.state.storage.list<Declaration>({ prefix: DECL_PREFIX });
    const history = [...decls.values()].sort((a, b) => a.seq - b.seq);
    const latest = history.length > 0 ? (history[history.length - 1] as Declaration) : null;
    return deriveSolvency(latest === null ? null : latest.balanceFcfa, await this.committedClaimsAmount());
  }

  private async appendJournal(action: string, entity: string, detail: Record<string, unknown>): Promise<void> {
    const seq = ((await this.state.storage.get<number>(SEQ_JOURNAL)) ?? 0) + 1;
    const row: JournalRow = { seq, action, actor: FONDS_ACTOR, at: new Date().toISOString(), entity, detail };
    await this.state.storage.put(`${JOURNAL_PREFIX}${String(seq).padStart(8, '0')}`, row);
    await this.state.storage.put(SEQ_JOURNAL, seq);
  }
}
