WO-OPS-0.1 — EVIDENCE PACKET (the one re-pin)
=============================================
Repo: beurni2/platform · branch claude/platform-ops-console-90txec
Code under review: commit e7fbff79bf73c1718872536979ffb51c7d23b571 (NOT merged — founder review)
Canon pin: platform-contracts 04af4b5266d53866a2b6d5800e270d3fffac2b35 (v0.9.4)

FAILURES FIRST
--------------
No outstanding failures. From a cache-isolated CLEAN-HOME cold clone of the
committed bytes at e7fbff7, ALL GATES GREEN; the only failing runs are the five
intentional negative fixtures (exit 1, required). Fresh-context verifier: OVERALL
PASS (A–F). No open debts introduced; debt ③ CLOSED this slice.

WHAT THIS SLICE DID
-------------------
- DO-FIRST: grep -c 'git@github.com:' pnpm-lock.yaml at 4440ce0 = 0 (asserted).
- Re-pinned @platform/{contracts,i18n,ui-tokens} deps (root + app) AND the
  pnpm-workspace overrides to 04af4b5 (canon v0.9.4, the current release —
  self-anchored: the sha exists, is v0.9.4, "founder review passed"). GUARD:
  installed @platform/contracts version = 0.9.4.
- /docs refreshed from canon@04af4b5 — ECOSYSTEM-MASTER-REFERENCE.md and
  Ecosystem-Engineering-Execution-Contract.md moved; both match the v0.9.4
  manifest sha256. All 11 docs match.
- DEBT ③ CLOSED: the drift-check --pinned-version is DERIVED from the installed
  @platform/contracts version (no hand-kept string); a planted mismatch fires
  ("0.0.0-planted-mismatch does not match manifest packageVersion 0.9.4").
- NEW permanent gate: lockfile URL-form (no SSH-form git URLs), planted negative
  fires. Defense in depth; canon v0.9.4 carries the authoritative standing law.
- Stale-provenance sweep (verifier sub-finding): every code/config/README
  current-state claim now reads 04af4b5 / v0.9.4; the 29-icon set is byte-stable
  across v0.9.1→v0.9.4 so icons were not re-copied.

UNTOUCHED (by CTO direction): debts ① (literal-only type guard) and ②
(approve() maker-envelope re-check) wait for the first-real-ops-command slice.
The spine (maker-checker.ts, audit-log.ts) is unchanged.

CONTENTS
--------
  diff.txt ........................... git diff origin/main...HEAD (WO-OPS-0.1 delta; _review excluded)
  logs/branch-log.txt ................ git log --oneline --stat origin/main..HEAD (3 commits)
  HEAD-ANCHOR.txt .................... git rev-parse HEAD == git ls-remote (local == origin)
  JOURNAL.md ......................... the committed JOURNAL (WO-OPS-0.1 entry at the end)
  COLD-PROOF.txt ..................... clean-HOME isolation evidence at e7fbff7, ALL GREEN
  VERIFIER-VERDICT.txt ............... fresh-context verifier, verbatim: A–F all PASS + sub-finding resolution
  gates/*.txt ........................ the raw gate logs from the e7fbff7 cold clone

DoD (WO-OPS-0.1)
----------------
  re-pin deps + overrides to 04af4b5 ............... yes
  installed @platform/contracts version = 0.9.4 ... yes (GUARD, incl. cold clone)
  zero git@github.com: in committed lockfile ...... yes (+ permanent gate + planted negative)
  /docs + manifest refreshed to v0.9.4 ............ yes (all 11 match manifest sha256)
  debt ③ closed — planted mismatch fires .......... yes
  cold proof on committed bytes (CLEAN HOME) ...... yes (COLD-PROOF.txt)
  fresh-context verifier verdict .................. yes (OVERALL PASS)
  debts ① ② untouched ............................. yes (spine unchanged)
