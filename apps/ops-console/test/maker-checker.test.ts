import { describe, it, expect } from 'vitest';
import type { EventEnvelope } from '@platform/contracts';
import {
  actor,
  issue,
  approve,
  MakerCheckerError,
  MakerCheckerSameIdentityError,
} from '../src/maker-checker';
import { OPS_ACTION_PENDING } from '../src/ops-action';

const env = (who: string, id: string): EventEnvelope => ({
  command_id: id,
  correlation_id: 'corr-1',
  aggregateVersion: 0,
  actor: who,
  serverTime: '2026-07-13T09:00:00.000Z',
  version: '1',
});

describe('maker-checker — two different people, or it does not happen', () => {
  const alice = actor('alice');
  const bob = actor('bob');

  it('a DIFFERENT identity can approve a maker’s command', () => {
    const cmd = issue(alice, {
      action: OPS_ACTION_PENDING,
      reason: 'incident 22h',
      entity: 'capability:checkout',
      envelope: env('alice', 'cmd-issue'),
    });
    const approved = approve(cmd, bob, env('bob', 'cmd-approve'));
    expect(approved.command.maker.id).toBe('alice');
    expect(approved.checker.id).toBe('bob');
  });

  it('the SAME identity is refused at RUNTIME even when the compiler is subverted (cast)', () => {
    const cmd = issue(alice, {
      action: OPS_ACTION_PENDING,
      reason: 'incident 22h',
      entity: 'capability:checkout',
      envelope: env('alice', 'cmd-issue'),
    });
    // Subvert the type-level guard the way a service boundary / `any` would:
    // pretend alice is a distinct checker. At runtime her id is still "alice".
    const aliceAsChecker = alice as unknown as typeof bob;
    expect(() => approve(cmd, aliceAsChecker, env('alice', 'cmd-approve'))).toThrow(
      MakerCheckerSameIdentityError,
    );
  });

  it('the issued envelope actor must equal the maker', () => {
    expect(() =>
      issue(alice, { action: OPS_ACTION_PENDING, reason: 'r', entity: 'e', envelope: env('bob', 'cmd') }),
    ).toThrow(MakerCheckerError);
  });

  it('the approval envelope actor must equal the checker', () => {
    const cmd = issue(alice, {
      action: OPS_ACTION_PENDING,
      reason: 'r',
      entity: 'e',
      envelope: env('alice', 'cmd-issue'),
    });
    expect(() => approve(cmd, bob, env('carol', 'cmd-approve'))).toThrow(MakerCheckerError);
  });

  it('an invalid canon envelope is refused at the boundary (EventEnvelopeSchema)', () => {
    const bad = {
      command_id: '',
      correlation_id: 'c',
      aggregateVersion: 0,
      actor: 'alice',
      serverTime: 't',
      version: '1',
    } as unknown as EventEnvelope;
    expect(() =>
      issue(alice, { action: OPS_ACTION_PENDING, reason: 'r', entity: 'e', envelope: bad }),
    ).toThrow();
  });
});
