import { describe, it, expect } from 'vitest';
import type { PayAtDoorEligibility } from '@platform/contracts';
import {
  consumeEligibility,
  consumeEligibilityFeed,
  canGateAction,
  ELIGIBILITY_MAX_AGE_MS,
  type EligibilityPull,
} from '../src/refusal/feed';
import { MockEligibilityPort } from '../src/refusal/mock';
import { buildSandboxEligibilityPort, SANDBOX_BUYER_REFS, SANDBOX_NOW } from '../src/refusal/sandbox';

const NOW = '2026-07-14T12:00:00.000Z';
const nowMs = Date.parse(NOW);
const at = (offsetMs: number): string => new Date(nowMs + offsetMs).toISOString();
const value = (over: Partial<PayAtDoorEligibility> = {}): PayAtDoorEligibility => ({
  buyerRef: 'buyer:x',
  state: 'allowed',
  buyerRefusalCount: 0,
  buyerRiskState: 'normal',
  requiredDeposit: 0,
  ...over,
});
const ok = (raw: unknown): EligibilityPull => ({ ok: true, raw });
const envelope = (asOf: string, v: PayAtDoorEligibility = value(), version = 1): unknown => ({
  version,
  asOf,
  value: v,
});

describe('WO-OPS-DESK-6-FEED — the eligibility feed consumer (fresh-or-fail)', () => {
  it('the freshness bound is 60 seconds (founder ruling)', () => {
    expect(ELIGIBILITY_MAX_AGE_MS).toBe(60_000);
  });

  it('a fresh in-bound read → fresh, and ONLY fresh may gate', () => {
    const v = value({ buyerRef: 'buyer:awa' });
    const verdict = consumeEligibility(ok(envelope(at(-10_000), v, 3)), NOW);
    expect(verdict.status).toBe('fresh');
    if (verdict.status === 'fresh') {
      expect(verdict.eligibility).toEqual(v); // verbatim, unrecomputed
      expect(verdict.version).toBe(3);
    }
    expect(canGateAction(verdict)).toBe(true);
  });

  it('the 60s boundary is inclusive-fresh, exclusive-stale (never a hair too lax)', () => {
    // exactly at the bound → still fresh (age == MAX is not > MAX)
    expect(consumeEligibility(ok(envelope(at(-60_000))), NOW).status).toBe('fresh');
    // one ms past → stale
    expect(consumeEligibility(ok(envelope(at(-60_001))), NOW).status).toBe('stale');
  });

  it('stale, absent, unreachable, rejected ALL block (canGateAction false) — never serve a stale verdict', () => {
    const stale = consumeEligibility(ok(envelope(at(-120_000))), NOW);
    const absent = consumeEligibility(ok(undefined), NOW);
    const unreachable = consumeEligibility({ ok: false }, NOW);
    const notModel = consumeEligibility(ok({ nope: true }), NOW);
    const badPayload = consumeEligibility(
      ok({ version: 1, asOf: at(-1000), value: { ...value(), buyerPhone: '+226 70 00 00 00' } }),
      NOW,
    );
    expect(stale.status).toBe('stale');
    expect(absent.status).toBe('absent');
    expect(unreachable.status).toBe('unreachable');
    expect(notModel).toEqual({ status: 'rejected', reason: 'not_a_read_model' });
    expect(badPayload).toEqual({ status: 'rejected', reason: 'payload_not_contract_shaped' });
    for (const verdict of [stale, absent, unreachable, notModel, badPayload]) {
      expect(canGateAction(verdict), verdict.status).toBe(false);
    }
  });

  it('a strict envelope: an undeclared envelope key is refused (payload_not_contract_shaped)', () => {
    const verdict = consumeEligibility(ok({ version: 1, asOf: at(-1000), value: value(), extra: 1 }), NOW);
    expect(verdict).toEqual({ status: 'rejected', reason: 'payload_not_contract_shaped' });
  });

  it('the security line: a planted buyer-PII key on the value is refused CLOSED (not accepted)', () => {
    const leaked = { version: 1, asOf: at(-1000), value: { ...value(), buyerPhone: '+226 70 00 00 00' } };
    expect(consumeEligibility(ok(leaked), NOW).status).toBe('rejected');
  });

  it('COLD START / empty channel → absent → block; eligible is NEVER assumed', () => {
    const emptyPort = new MockEligibilityPort(NOW, []);
    const feed = consumeEligibilityFeed(emptyPort, ['buyer:awa', 'buyer:fatou'], NOW);
    expect(feed.confirmed).toHaveLength(0);
    expect(feed.blocked).toEqual([
      { buyerRef: 'buyer:awa', reason: 'absent' },
      { buyerRef: 'buyer:fatou', reason: 'absent' },
    ]);
  });
});

describe('the CERTIFIED mock misbehaves on demand (Execution Contract §3)', () => {
  const mock = new MockEligibilityPort(NOW, [
    { buyerRef: 'b:fresh', mode: 'fresh', ageSec: 5, version: 2, value: value({ buyerRef: 'b:fresh' }) },
    { buyerRef: 'b:stale', mode: 'stale', ageSec: 120, version: 2, value: value({ buyerRef: 'b:stale' }) },
    { buyerRef: 'b:absent', mode: 'absent' },
    { buyerRef: 'b:unreach', mode: 'unreachable' },
    { buyerRef: 'b:bad', mode: 'malformed', ageSec: 5, version: 1, value: value({ buyerRef: 'b:bad' }) },
  ]);

  it('each mode yields its verdict; an unknown buyer is absent (never fabricated)', () => {
    expect(consumeEligibility(mock.readEligibility('b:fresh'), NOW).status).toBe('fresh');
    expect(consumeEligibility(mock.readEligibility('b:stale'), NOW).status).toBe('stale');
    expect(consumeEligibility(mock.readEligibility('b:absent'), NOW).status).toBe('absent');
    expect(consumeEligibility(mock.readEligibility('b:unreach'), NOW).status).toBe('unreachable');
    expect(consumeEligibility(mock.readEligibility('b:bad'), NOW).status).toBe('rejected');
    expect(consumeEligibility(mock.readEligibility('b:unknown'), NOW).status).toBe('absent');
  });
});

describe('the sandbox feed exercises the whole verdict space at the fixed clock', () => {
  it('4 fresh buyers (one per rung) confirm; the stale and unreachable buyers block', () => {
    const feed = consumeEligibilityFeed(buildSandboxEligibilityPort(), SANDBOX_BUYER_REFS, SANDBOX_NOW);
    expect(feed.confirmed.map((r) => r.buyerRef)).toEqual([
      'buyer:awa',
      'buyer:fatou',
      'buyer:salif',
      'buyer:issa',
    ]);
    expect(feed.blocked).toEqual([
      { buyerRef: 'buyer:tacko', reason: 'stale' },
      { buyerRef: 'buyer:kone', reason: 'unreachable' },
    ]);
  });
});
