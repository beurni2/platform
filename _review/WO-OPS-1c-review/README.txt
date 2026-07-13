WO-OPS-1c — EVIDENCE PACKET — the interim's executioner
=======================================================
Slice   : WO-OPS-1c (AMBER) — re-pin canon → v0.9.8 and delegate the
          payment-operator allow-list to canon's PaymentOperatorActorSchema,
          closing the WO-OPS-1b named interim debt.
Repo    : github.com/beurni2/platform
Branch  : claude/platform-ops-console-90txec
Code sha: d3b670fdd6982ecdc00130cf7822b04c3ea9ba64   (== origin — HEAD-ANCHOR.txt)
Base    : restarted from merged main 298f67f (the WO-OPS-1b merge)
Canon   : platform-contracts ba6f16d/v0.9.6 → 67bda02/v0.9.8 (WO-5.12)
Tier    : AMBER (a re-pin + a guard delegation; contract-boundary path)
Status  : DO NOT MERGE — founder review.


0. FAILURES-FIRST (read this before the green)
-----------------------------------------------
Nothing failed at the final bytes. Every gate is green at d3b670f (§F below).
What a reviewer should scrutinize, stated plainly:

  • THIS IS A CONTRACT-BOUNDARY RE-PIN. The pin moved ba6f16d/v0.9.6 →
    67bda02/v0.9.8. The gate was verified by MY OWN fetch of canon origin/main
    (not trusted from the relay): 67bda02 is the v0.9.8 release merge and
    exports PaymentOperatorActorSchema, which types HandoffAuthorization.
    authorizedBy. See HEAD-ANCHOR.txt + VERIFIER-VERDICT.txt §A.

  • THE DELEGATION MUST BE SEMANTICS-PRESERVING. Canon's schema regex is
    /^ops:payment:[A-Za-z0-9._:-]+$/ — byte-identical to the founder ruling the
    app-side interim carried. So the guard's behavior does not change; only its
    OWNER does (app code → canon). The refusal fixtures (supplier ·
    logistics-service:dispatch · ops:moderation:diallo · empty suffix) are
    unchanged and still green — now against canon's schema (§B).

  • DEBTS ① and ② (from WO-OPS-0) are UNCHANGED — not in scope here. The
    maker-checker type guard is still vacuous for runtime string ids (① — the
    runtime compare carries it); approve() still re-asserts envelope.actor ===
    maker.id (②). This slice touched neither.

  • NO /docs RE-SYNC. Canon's doc manifest only version-bumped for platform's
    11 mirrored specs (the docs that changed in canon — QR-DIMENSIONS.md,
    tokens.json — are not in platform's mirrored set). drift-check passes at a
    DERIVED 0.9.8 with the 11 specs byte-identical. `git diff origin/main..HEAD
    -- docs/` is empty (§E).

If the founder does not accept moving the pin to 67bda02, this slice does not
merge — everything here is downstream of that one decision.


1. WHAT'S IN THIS PACKET
------------------------
  README.txt .................. this index
  HEAD-ANCHOR.txt ............. rev-parse HEAD vs ls-remote origin (self-anchor)
  diff.txt .................... full diff origin/main..d3b670f (322 lines)
  JOURNAL.md .................. the committed journal @ d3b670f (WO-OPS-1c entry; debt closed)
  VERIFIER-VERDICT.txt ........ fresh-context verifier, verbatim (A–F)
  COLD-PROOF.txt .............. warm + clean-HOME cold isolation proof, auth line shown
  logs/branch-log.txt ......... one-commit log + file stat
  gates/ ...................... captured gate output (see §F)


2. HOW TO READ IT (verify, don't trust)
---------------------------------------
  1. HEAD-ANCHOR.txt — confirm d3b670f == origin.
  2. diff.txt — the change is a re-pin + one guard delegation. Read issue.ts.
  3. VERIFIER-VERDICT.txt — a fresh context re-ran the subversions (A–F).
  4. COLD-PROOF.txt — clean $HOME, frozen lockfile, GUARD 0.9.8, schema refuses
     non-ops:payment cold, all gates green.


3. DoD CHECKLIST (WO-OPS-1c)
----------------------------
  [x] Gate verified by own fetch: canon WO-5.12 / v0.9.8 (67bda02) on canon
      origin/main; exports PaymentOperatorActorSchema; typing authorizedBy .. HEAD-ANCHOR, §A
  [x] The one re-pin: deps + overrides + apps manifest; lockfile regenerated;
      installed contracts prints 0.9.8; 0 ssh-form; docs re-synced iff manifest
      moved (it did not) ................................. §A, §E, COLD-PROOF
  [x] breakglass/issue.ts: app-side regex removed; guard delegates to
      PaymentOperatorActorSchema; authorizedBy constrained at the contract
      layer; imports + delegation only, no test edited ... §B, §C
  [x] Interim debt (WO-OPS-1b) CLOSED, this slice named executioner .. JOURNAL.md
  [x] Refusal fixtures unchanged and green (supplier · logistics-service:dispatch
      · ops:moderation:diallo · empty suffix) ............ §B, §F
  [x] Warm + clean-HOME cold, auth line shown, GUARD 0.9.8 .......... COLD-PROOF.txt
  [x] Fresh-context verifier on the final bytes: A–F ................ VERIFIER-VERDICT.txt
  [x] Scope: audit-log / moderation / break-glass board+view+sandbox byte-
      unchanged; fourth secret still unreachable ......... §C, §D


(§A–§F refer to the section labels in VERIFIER-VERDICT.txt.)
