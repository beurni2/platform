WO-OPS-0 — EVIDENCE PACKET (v2 — now WITH THE DIFF)
===================================================
Repo: beurni2/platform · branch claude/platform-ops-console-90txec
Code under review: commit eade3220ced2a084e4901d33f5bc5a8e7388f57f (NOT merged)
Canon pin: platform-contracts 4440ce0f217372051d9876cf6aaefda8d006a3ba (v0.9.1)

WHY v2: the CTO held WO-OPS-0 because the first packet shipped no bytes — only
a verifier's word. This packet carries the diff, the branch log, and a
self-anchoring HEAD proof, plus two corrections the CTO ordered (below).

READ THE SPINE HERE (the two files the CTO reviews line by line)
---------------------------------------------------------------
In diff.txt, jump to:
  apps/ops-console/src/maker-checker.ts   (~151 lines)  — the two-person law
  apps/ops-console/src/audit-log.ts       (~94 lines)   — append-only
  apps/ops-console/src/ops-action.ts      (~33 lines)   — the quarantined debt

CORRECTIONS APPLIED (CTO directives, 2026-07-13)
------------------------------------------------
1. DIRECTIVE-PROVENANCE. The ops action-type and the canon-pin pick were CTO
   rulings (in-session via AskUserQuestion), NOT founder rulings — the founder
   ruled on neither. Every "founder ruling / founder-supplied" mislabel is
   corrected across README.md, JOURNAL.md, and the maker-checker/audit-log
   headers. (Legitimate founder references remain only where they belong:
   founder decision D22, the WO's own "THE FOUNDER SUPPLIES IT" quote, and the
   canon commit message that records "founder review passed".)
2. THE OPS ACTION-TYPE is now a QUARANTINED LOCAL CLOSED UNION — a named debt
   (apps/ops-console/src/ops-action.ts), one debt sentinel today
   ('pending:no-ops-command-defined', explicitly not a command), to be derived
   later from commands that actually exist. It replaces the previous open
   `string`. Canon has no ops-command vocabulary; inventing one stays refused.

FAILURES FIRST
--------------
No outstanding failures. From a cache-isolated cold clone of the committed bytes
at eade322, ALL GATES GREEN; the only failing runs are the intentional negative
fixtures (exit 1, required). One ⏳ DEBT carried forward: retire the action-type
sentinel and derive real members when canon names an ops-command vocabulary.

CONTENTS
--------
  diff.txt ........................... git diff main...HEAD (excludes _review/ to avoid
                                       self-reference; all code, docs, config, tests,
                                       lockfile included)
  logs/branch-log.txt ................ git log --oneline --stat main..HEAD (all 3 commits)
  HEAD-ANCHOR.txt .................... git rev-parse HEAD == git ls-remote (local == origin)
  JOURNAL.md ......................... the committed JOURNAL, corrected
  COLD-PROOF.txt ..................... isolation-evidence at eade322: cold clone == working
                                       HEAD, isolated store, frozen lockfile, ALL GREEN
  MAKER-CHECKER-COMPILE-PROOF.txt .... the type-level guard bites (TS2345 → never)
  VERIFIER-VERDICT.txt ............... fresh-context verifier, verbatim: A/B/C/D all PASS
  gates/*.txt ........................ the 9 raw gate logs from the eade322 cold clone

DoD (WO-OPS-0), each satisfied
------------------------------
  repo exists, CI green ............................ yes (workflow + local cold-proof green)
  canon pinned BY SHA (named) ..................... 4440ce0 (v0.9.1) — app deps + overrides
  eight routes render honest empty states ......... yes (Playwright, all 8)
  maker-checker same-identity FAILS TO COMPILE .... yes (TS2345 → never; guard proven to bite)
  ... and THROWS at runtime ....................... yes (MakerCheckerSameIdentityError)
  audit log proven append-only (mutate + delete) .. yes (both refuse; no remove/delete/update)
  zero-hardcode scan green ........................ yes (16 src files; + negative fixture fails)
  Grand Teint tokens consumed, no local values .... yes (shared/neutral palette; 29 icons byte-verbatim)
  typecheck ....................................... exit 0
  cold proof ...................................... COLD-PROOF.txt (eade322)
