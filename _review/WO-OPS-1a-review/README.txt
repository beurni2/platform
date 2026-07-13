WO-OPS-1a — EVIDENCE PACKET (Desk 3 goes live · the first real ops command)
===========================================================================
Repo: beurni2/platform · branch claude/platform-ops-console-90txec
Code under review: commit a77f993d418353eb321d0657460e1c677f20c612 (NOT merged — founder review)
Canon pin: platform-contracts ba6f16d78a2a5a13ff6877237cef6d77d35d8d65 (v0.9.6)

READ FIRST (the RED heart):
  apps/ops-console/src/moderation/decide.ts      — moderation:decide (issue/approve, ops-only, canon payload)
  apps/ops-console/src/maker-checker.ts          — the one-line debt ② re-assert in approve()
  apps/ops-console/test/moderation-decide.test.ts — 8 adversarial tests (supplier both halves · debts ①/② · reasonless · minted UUID)
  apps/ops-console/test-d/moderation-decide.type-test.ts — compile guard + debt ① written down

FAILURES FIRST
--------------
No outstanding failures. Warm + clean-HOME cold proof at a77f993: ALL GATES
GREEN, GUARD 0.9.6; the only failing runs are the intentional negative fixtures
(exit 1, required). Fresh-context verifier: OVERALL PASS (A–G). Named debts ①
and ② are CLOSED this slice (their assigned executioner).

WHAT THIS SLICE DID
-------------------
- Gated on canon WO-5.10; re-pinned @platform/* to ba6f16d (v0.9.6). Self-anchored
  by content: built package prints 0.9.6 and exports ModerationDecisionSchema +
  ModerationReasonCodeSchema (6 codes) + mintCommandId.
- The FIRST REAL ops command, moderation:decide: canon ModerationDecisionSchema
  payload (supplier refused at the schema; reasonless/silent rejection
  unrepresentable), a SECOND operator approves (supplier refused there too),
  command_id minted by canon mintCommandId (UUIDv4/CSPRNG). OpsActionType grew to
  'moderation:decide'; the pending sentinel retired.
- DEBT ① closed (documented): the compile guard is literal-only; production rests
  on the runtime identity check alone — proven on the real command under `any`.
- DEBT ② closed (fixed): approve() re-asserts command.envelope.actor ==
  command.maker.id; a hand-built lying command is refused.
- Desk 3 LIVE: renders the moderation queue (pending/decided, reasons verbatim)
  from a preview exercising the real command path. The seven other desks stay
  honest shells — proven structurally + in the e2e.
- RED ceremony: adversarial tests written and run RED before implementation.

CONTENTS
--------
  diff.txt ........................... git diff origin/main...HEAD (WO-OPS-1a delta; _review excluded)
  logs/branch-log.txt ................ git log --oneline --stat origin/main..HEAD
  HEAD-ANCHOR.txt .................... git rev-parse HEAD == git ls-remote (local == origin)
  JOURNAL.md ......................... the committed JOURNAL (WO-OPS-1a entry at the end)
  COLD-PROOF.txt ..................... warm + clean-HOME cold proof at a77f993, AUTH LINE SHOWN
  VERIFIER-VERDICT.txt ............... fresh-context verifier, verbatim: A–G all PASS
  gates/*.txt ........................ the raw gate logs from the a77f993 cold clone

DoD (WO-OPS-1a)
----------------
  OpsActionType gains 'moderation:decide' ......... yes (sentinel retired)
  command carries canon ModerationDecisionSchema .. yes (payload; supplier refused at issue)
  maker ≠ checker on a REAL command ............... yes (runtime guard fires under `any`)
  supplier refused at issue AND approve ........... yes (both halves)
  debt ① written down ............................. yes (code + type-test + JOURNAL)
  debt ② the one line + planted forged command .... yes (refused)
  Desk 3 renders queue; seven stay shells ......... yes (absence proven structurally + e2e)
  adversarial tests first ......................... yes (RED captured before impl)
  warm + cold (fresh HOME + auth line shown) ...... yes (COLD-PROOF.txt)
  fresh-context verifier .......................... yes (OVERALL PASS)
  FORBIDDEN (no payment/franc; audit untouched) ... respected (verifier F)
