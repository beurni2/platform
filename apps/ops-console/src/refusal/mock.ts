/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Ce bureau REGARDE, il n'actionne rien.
 */

/**
 * THE CERTIFIED MOCK (Execution Contract §3) — the `readEligibility` source that
 * backs Desk 6's tests and demo. A mock is not trustworthy until it MISBEHAVES
 * like the real service, so this one does, on demand:
 *   - `fresh`      — an in-bound read-model (asOf `ageSec` ago).
 *   - `stale`      — a read-model whose asOf is older than the freshness bound.
 *   - `absent`     — the channel is up but has no record for this buyer.
 *   - `unreachable`— a transport FAILURE (`ok:false`) — where a real client's
 *                    auth/network failure lands.
 *   - `malformed`  — a payload with a planted NON-CONTRACT key, so the strict
 *                    envelope+value schema refuses it (a would-be buyer-PII leak
 *                    is rejected, never accepted).
 * The real HTTP client plugs into the same `EligibilityProjectionPort` at
 * integration (ELIGIBILITY-WIRE-AUTH, deferred) — the port already assumes an
 * authenticated transport, so the mock stands in for an authenticated channel.
 */
import type { EligibilityProjectionPort, EligibilityPull } from './feed.js';

export type MockMode = 'fresh' | 'stale' | 'absent' | 'unreachable' | 'malformed';

export interface MockEligibilityEntry {
  readonly buyerRef: string;
  readonly mode: MockMode;
  /** age of the read-model at `asOfBase` (seconds); fresh < bound, stale > bound. */
  readonly ageSec?: number;
  readonly version?: number;
  /** the canon PayAtDoorEligibility value (for fresh/stale/malformed). */
  readonly value?: unknown;
}

/** A key the canon eligibility shape does not declare — a planted buyer-PII leak. */
const PLANTED_NON_CONTRACT_KEY = 'buyerPhone';

export class MockEligibilityPort implements EligibilityProjectionPort {
  readonly #byBuyer = new Map<string, MockEligibilityEntry>();
  readonly #asOfBase: number;

  constructor(asOfBase: string, entries: readonly MockEligibilityEntry[]) {
    this.#asOfBase = Date.parse(asOfBase);
    for (const entry of entries) this.#byBuyer.set(entry.buyerRef, entry);
  }

  readEligibility(buyerRef: string): EligibilityPull {
    const entry = this.#byBuyer.get(buyerRef);
    if (entry === undefined || entry.mode === 'absent') return { ok: true, raw: undefined };
    if (entry.mode === 'unreachable') return { ok: false };

    const asOf = new Date(this.#asOfBase - (entry.ageSec ?? 0) * 1000).toISOString();
    const value =
      entry.mode === 'malformed'
        ? { ...(entry.value as Record<string, unknown>), [PLANTED_NON_CONTRACT_KEY]: '+226 70 00 00 00' }
        : entry.value;
    return { ok: true, raw: { version: entry.version ?? 1, asOf, value } };
  }
}
