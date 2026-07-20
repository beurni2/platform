/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Ce bureau REGARDE, il n'actionne rien.
 */

/**
 * DESK 6 — THE ELIGIBILITY FEED CONSUMER (WO-OPS-DESK-6-FEED). Transport B
 * (HTTP read-model PULL), the shape the shipped supply wire actually has: a
 * CONSUMER + a certified misbehaving mock, with the real HTTP client and the
 * cross-repo auth DEFERRED to a named integration slice (ELIGIBILITY-WIRE-AUTH,
 * E3-shaped — journalled). This invents no wire and no second pattern; it
 * mirrors shop-plus's SW-2 (`packages/supply-consumer`, merged 79a8953), which
 * shipped its consumer with the real client deferred too.
 *
 * ELIGIBILITY IS NOT SUPPLY — fresh-or-fail, never serve-stale. Supply tolerates
 * a 15-min TTL (one shared dataset, a latency blip); eligibility is PER-BUYER and
 * GATES a point-in-time authorization, so a stale "eligible" is a CORRECTNESS
 * bug. A read older than the bound, OR a failed/absent/malformed pull, yields a
 * BLOCK verdict — the console shows « impossible de confirmer l'éligibilité
 * maintenant » and never renders a stale eligible/ineligible verdict. Cold start
 * / empty channel is `absent` → block; eligible is NEVER assumed.
 *
 * THE TRANSPORT IS ASSUMED AUTHENTICATED. The port models an authenticated
 * channel: `ok: false` is a transport failure — and a real client's auth/network
 * failure lands there, mapping to `unreachable` → block. The AUTH DECISION is
 * deferred; the ASSUMPTION is not — the deferred real client lands with auth as
 * a precondition this contract already expects.
 */
import {
  IsoTimestampSchema,
  PayAtDoorEligibilitySchema,
  type PayAtDoorEligibility,
} from '@platform/contracts';

/**
 * FRESHNESS BOUND — FOUNDER RULING (2026-07-20), rationale verbatim:
 * "eligibility is a point-in-time authorization, not a staleness tolerance like
 *  supply's 15-min TTL — so it is fresh-or-fail, the bound absorbing pull latency
 *  only. Reads older than 60s OR a failed/absent pull → the console shows 'cannot
 *  confirm eligibility right now' and BLOCKS the gated action. Never serve a stale
 *  verdict; never assume eligible on cold start / empty cache. If testing shows
 *  real pull latency spiking past ~60s (false blocks), lengthen ON EVIDENCE — the
 *  safe error is too-fresh, never too-stale."
 */
export const ELIGIBILITY_MAX_AGE_MS = 60 * 1000;

/**
 * The read-model envelope the console pulls: `{ version, asOf, value }`, where
 * `value` is the canon strict `PayAtDoorEligibilitySchema` (consumed VERBATIM —
 * never redefined). `asOf` (when the projection was WRITTEN) and `version` live
 * on the envelope, exactly as supply's `SupplyReadModel` carries them and NOT in
 * the canon value shape — so the canon eligibility shape needs no new field. The
 * envelope is the platform↔shop agreed contract (canon has no read-model wrapper),
 * mirroring the SW-1↔SW-2 envelope.
 */
export interface EligibilityReadModel {
  readonly version: number;
  readonly asOf: string;
  readonly value: PayAtDoorEligibility;
}

const ENVELOPE_KEYS: ReadonlySet<string> = new Set(['version', 'asOf', 'value']);

/**
 * Parse a pulled payload into the read-model envelope, STRICTLY. Rejects a
 * non-envelope, any undeclared envelope key, a non-int/<1 version, a bad `asOf`
 * (canon `IsoTimestampSchema`), and — the security line — a `value` that is not
 * the canon strict `PayAtDoorEligibility` (a planted buyer-PII key fails here).
 * `hasEnvelope` distinguishes "not a read-model" from "envelope present but not
 * contract-shaped", for an honest block reason.
 */
function parseEligibilityReadModel(
  raw: unknown,
): { ok: true; model: EligibilityReadModel } | { ok: false; hasEnvelope: boolean } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, hasEnvelope: false };
  const record = raw as Record<string, unknown>;
  const hasEnvelope = 'version' in record && 'asOf' in record && 'value' in record;
  if (!hasEnvelope) return { ok: false, hasEnvelope: false };
  if (Object.keys(record).some((key) => !ENVELOPE_KEYS.has(key))) return { ok: false, hasEnvelope: true };

  const version = record['version'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, hasEnvelope: true };
  }
  const asOf = IsoTimestampSchema.safeParse(record['asOf']);
  if (!asOf.success) return { ok: false, hasEnvelope: true };
  const value = PayAtDoorEligibilitySchema.safeParse(record['value']);
  if (!value.success) return { ok: false, hasEnvelope: true };

  return { ok: true, model: { version, asOf: asOf.data, value: value.data } };
}

/** A single pull over the (assumed-authenticated) transport. `ok:false` = transport failed. */
export type EligibilityPull = { readonly ok: true; readonly raw: unknown } | { readonly ok: false };

/** The pull port. The certified mock backs tests/demo; the real HTTP client plugs in at integration. */
export interface EligibilityProjectionPort {
  /**
   * Pull the read-model bytes for one buyer over the AUTHENTICATED transport.
   * `{ ok:false }` is a transport failure (a real client's auth/network failure).
   */
  readEligibility(buyerRef: string): EligibilityPull;
}

export type BlockReason = 'stale' | 'absent' | 'unreachable' | 'rejected';

export type EligibilityVerdict =
  | { readonly status: 'fresh'; readonly eligibility: PayAtDoorEligibility; readonly asOf: string; readonly version: number }
  | { readonly status: 'stale'; readonly asOf: string; readonly ageMs: number }
  | { readonly status: 'absent' }
  | { readonly status: 'unreachable' }
  | { readonly status: 'rejected'; readonly reason: 'not_a_read_model' | 'payload_not_contract_shaped' };

/**
 * Consume ONE pull into a verdict. Fresh-or-fail: transport failure → unreachable;
 * no record → absent; non-contract payload → rejected (strict schema); age beyond
 * the bound → stale. Only a fresh, in-bound read yields `fresh`. Pure: no clock of
 * its own (the caller passes `nowIso`), no write.
 */
export function consumeEligibility(pull: EligibilityPull, nowIso: string): EligibilityVerdict {
  if (!pull.ok) return { status: 'unreachable' };
  if (pull.raw === undefined || pull.raw === null) return { status: 'absent' };

  const parsed = parseEligibilityReadModel(pull.raw);
  if (!parsed.ok) {
    return { status: 'rejected', reason: parsed.hasEnvelope ? 'payload_not_contract_shaped' : 'not_a_read_model' };
  }
  const model = parsed.model;

  const ageMs = Date.parse(nowIso) - Date.parse(model.asOf);
  if (ageMs > ELIGIBILITY_MAX_AGE_MS) {
    return { status: 'stale', asOf: model.asOf, ageMs };
  }
  return { status: 'fresh', eligibility: model.value, asOf: model.asOf, version: model.version };
}

/**
 * FRESH-OR-FAIL gate. Only a fresh verdict may back a gated eligibility action
 * (or render a real eligible/ineligible verdict). Stale, absent, unreachable, and
 * rejected all BLOCK — the console shows the honest « impossible de confirmer »
 * state, never a silent pass, never an assumed-eligible.
 */
export function canGateAction(verdict: EligibilityVerdict): boolean {
  return verdict.status === 'fresh';
}

export interface BlockedEntry {
  readonly buyerRef: string;
  readonly reason: BlockReason;
}

export interface EligibilityFeedResult {
  /** Fresh, contract-true eligibility records — the only ones that render a verdict. */
  readonly confirmed: readonly PayAtDoorEligibility[];
  /** Everything the console could not confirm — rendered as a block state, per buyer. */
  readonly blocked: readonly BlockedEntry[];
}

/**
 * Pull + consume the feed for a set of buyers into confirmed vs blocked. Pure
 * over the port; the caller renders `confirmed` as the ladder and `blocked` as
 * « impossible de confirmer ». Never throws — a bad pull is a block, not a crash.
 */
export function consumeEligibilityFeed(
  port: EligibilityProjectionPort,
  buyerRefs: readonly string[],
  nowIso: string,
): EligibilityFeedResult {
  const confirmed: PayAtDoorEligibility[] = [];
  const blocked: BlockedEntry[] = [];
  for (const buyerRef of buyerRefs) {
    const verdict = consumeEligibility(port.readEligibility(buyerRef), nowIso);
    if (verdict.status === 'fresh') {
      confirmed.push(verdict.eligibility);
    } else {
      blocked.push({ buyerRef, reason: verdict.status === 'rejected' ? 'rejected' : verdict.status });
    }
  }
  return { confirmed, blocked };
}
