/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Ce bureau REGARDE, il n'actionne rien.
 */

/**
 * Desk 6 sandbox feed (WO-OPS-DESK-6-FEED) — wires the CERTIFIED mock
 * (`MockEligibilityPort`) to the preview config in `preview.json`. The demo
 * population exercises the whole verdict space at a fixed clock: four FRESH
 * buyers (one per ladder rung) plus a STALE read and an UNREACHABLE channel — so
 * the console's consume-and-block states are honest, never hidden. No shop feed
 * is read; the real HTTP client + auth are deferred (ELIGIBILITY-WIRE-AUTH). The
 * seed lives in `preview.json` (DATA, not source): a feed delivers data, and the
 * `reason` fields are shop's DATA rendered verbatim — never platform copy.
 */
import preview from './preview.json';
import { MockEligibilityPort, type MockEligibilityEntry } from './mock.js';
import type { EligibilityProjectionPort } from './feed.js';

/** Fixed clock (= the mock's asOf base) so the gallery/verdicts are deterministic. */
export const SANDBOX_NOW = preview.asOfBase;

const SANDBOX_ENTRIES = preview.entries as readonly MockEligibilityEntry[];

/** The buyers the Desk 6 feed pulls, in preview order. */
export const SANDBOX_BUYER_REFS: readonly string[] = SANDBOX_ENTRIES.map((entry) => entry.buyerRef);

/** Build the certified mock port backing the preview. */
export function buildSandboxEligibilityPort(): EligibilityProjectionPort {
  return new MockEligibilityPort(preview.asOfBase, SANDBOX_ENTRIES);
}
