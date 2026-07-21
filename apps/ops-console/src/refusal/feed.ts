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
  consumeReadModel,
  makeReadModelSchema,
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
 * `value` is the canon strict `PayAtDoorEligibilitySchema` (consumed VERBATIM).
 * Built from the canon READ-MODEL KIT (`makeReadModelSchema`, contracts v1.2.0) —
 * the single shared envelope the two consumers (supply SW-2, this feed) now share,
 * so neither can drift. `asOf` (write time) and `version` live on the envelope,
 * not the canon value shape — so the eligibility shape needs no new field. This
 * replaced a hand-rolled parse; the kit does the identical strict parse.
 */
const ELIGIBILITY_READ_MODEL_SCHEMA = makeReadModelSchema(PayAtDoorEligibilitySchema);

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
  // The transport-level `unreachable` stays OUTSIDE the kit (it is not in the
  // kit's union) — a real client's auth/network failure lands here, deferred to
  // ELIGIBILITY-WIRE-AUTH.
  if (!pull.ok) return { status: 'unreachable' };

  // The raw-consume — strict schema + freshness — is the canon kit. Eligibility
  // passes its 60s bound and NO leakSweep: buyer-PII is refused by the strict
  // PayAtDoor value parse alone (eligibility's leak surface differs from supply's).
  const verdict = consumeReadModel(pull.raw, {
    schema: ELIGIBILITY_READ_MODEL_SCHEMA,
    maxAgeMs: ELIGIBILITY_MAX_AGE_MS,
    now: nowIso,
  });
  switch (verdict.status) {
    case 'fresh':
      return { status: 'fresh', eligibility: verdict.value, asOf: verdict.asOf, version: verdict.version };
    case 'stale':
      return { status: 'stale', asOf: verdict.asOf, ageMs: verdict.ageMs };
    case 'absent':
      return { status: 'absent' };
    case 'rejected':
      // With no leakSweep passed, the kit's `identity_material_refused` is
      // unreachable here — map it so this union stays honest (only the two parse
      // reasons occur for eligibility).
      return {
        status: 'rejected',
        reason: verdict.reason === 'identity_material_refused' ? 'payload_not_contract_shaped' : verdict.reason,
      };
  }
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
