/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Ce bureau REGARDE, il n'actionne rien.
 */

/**
 * Desk 6 sandbox ladder (WO-OPS-DESK-6) — a PREVIEW (« Aperçu ») exercised
 * against the REAL canon shape so the states are honest, not fabricated: every
 * record from `preview.json` is parsed through `PayAtDoorEligibilitySchema` and
 * would THROW if it were not shape-true. No shop feed is read —
 * `PayAtDoorEligibility` is emitted inside shop-plus and never reaches this repo
 * yet (the transport gap, flagged in ladder.ts).
 *
 * The seed lives in `preview.json` (DATA, not source): a feed delivers data, and
 * the `reason` / `state` / `buyerRiskState` fields are shop's DATA rendered
 * verbatim — never platform copy — so they do not belong inline in the source
 * catalog. A real feed replaces this file, byte for byte, at the integration
 * slice.
 */
import { PayAtDoorEligibilitySchema, type PayAtDoorEligibility } from '@platform/contracts';
import preview from './preview.json';

/** Fixed clock so the gallery/degradation render is deterministic. */
export const SANDBOX_NOW = '2026-07-14T12:00:00.000Z';

/**
 * One buyer per rung — good standing, a first fault (deposit), a repeat within
 * an active prepay-only window, and a suspended buyer: the ladder tightening
 * across the population, never blame. Shape-true or it throws.
 */
export function buildSandboxRefusalLadder(): readonly PayAtDoorEligibility[] {
  return preview.records.map((r) => PayAtDoorEligibilitySchema.parse(r));
}
