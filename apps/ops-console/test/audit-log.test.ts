import { describe, it, expect } from 'vitest';
import type { EventEnvelope } from '@platform/contracts';
import { AuditLog } from '../src/audit-log';

const env = (who: string, id: string): EventEnvelope => ({
  command_id: id,
  correlation_id: 'corr-1',
  aggregateVersion: 0,
  actor: who,
  serverTime: '2026-07-13T09:00:00.000Z',
  version: '1',
});

describe('audit log — append-only; nobody “corrects” in silence', () => {
  it('records who · what · why · when · entity · evidence', () => {
    const log = new AuditLog();
    const e = log.append({
      action: 'flag.toggle',
      reason: 'incident 22h',
      entity: 'capability:checkout',
      evidence: 'ref:INC-1',
      envelope: env('alice', 'cmd-1'),
    });
    expect(e.seq).toBe(0);
    expect(e.envelope.actor).toBe('alice'); // who
    expect(e.envelope.serverTime).toBe('2026-07-13T09:00:00.000Z'); // when
    expect(e.action).toBe('flag.toggle'); // what
    expect(e.reason).toBe('incident 22h'); // why
    expect(e.entity).toBe('capability:checkout'); // against which entity
    expect(e.evidence).toBe('ref:INC-1'); // with what evidence
    expect(log.length).toBe(1);
  });

  it('an entry CANNOT be mutated (deep-frozen — the write throws)', () => {
    const log = new AuditLog();
    log.append({ action: 'a', reason: 'r', entity: 'e', evidence: 'v', envelope: env('alice', 'c1') });
    const entry = log.entries[0]!;
    expect(() => {
      (entry as unknown as { reason: string }).reason = 'tampered';
    }).toThrow(TypeError);
    expect(() => {
      (entry.envelope as unknown as { actor: string }).actor = 'mallory';
    }).toThrow(TypeError);
    // the stored value is unchanged
    expect(log.entries[0]!.reason).toBe('r');
    expect(log.entries[0]!.envelope.actor).toBe('alice');
  });

  it('an entry CANNOT be deleted and the log CANNOT be trimmed', () => {
    const log = new AuditLog();
    log.append({ action: 'a', reason: 'r', entity: 'e', evidence: 'v', envelope: env('alice', 'c1') });
    log.append({ action: 'b', reason: 'r2', entity: 'e2', evidence: 'v2', envelope: env('bob', 'c2') });
    const snapshot = log.entries;
    expect(() => {
      (snapshot as unknown as unknown[]).pop();
    }).toThrow(TypeError);
    expect(() => {
      delete (snapshot as unknown as Record<number, unknown>)[0];
    }).toThrow(TypeError);
    // no remove / delete / update affordance exists on the surface at all
    const surface = log as unknown as Record<string, unknown>;
    expect(surface['remove']).toBeUndefined();
    expect(surface['delete']).toBeUndefined();
    expect(surface['update']).toBeUndefined();
    expect(log.length).toBe(2);
  });

  it('an invalid canon envelope is refused at append (EventEnvelopeSchema)', () => {
    const log = new AuditLog();
    const bad = {
      command_id: 'c',
      correlation_id: 'c',
      aggregateVersion: -1,
      actor: 'alice',
      serverTime: 't',
      version: '1',
    } as unknown as EventEnvelope;
    expect(() =>
      log.append({ action: 'a', reason: 'r', entity: 'e', evidence: 'v', envelope: bad }),
    ).toThrow();
    expect(log.length).toBe(0);
  });
});
