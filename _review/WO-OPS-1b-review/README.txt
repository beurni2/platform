WO-OPS-1b — EVIDENCE PACKET — the issuing half of break-glass (breakglass:issue)
================================================================================
Slice   : WO-OPS-1b (RED) — Desk 5 goes live with the payment operator's
          break-glass ISSUING surface: request → approve, two operators,
          consuming canon HandoffAuthorization machinery. app-side actor
          allow-list until canon WO-5.12.
Repo    : github.com/beurni2/platform
Branch  : claude/platform-ops-console-90txec
Code sha: dc86e8a8db7c7fee520c409288324b13b7ccf77a   (== origin — HEAD-ANCHOR.txt)
Canon   : platform-contracts @ ba6f16d78a2a5a13ff6877237cef6d77d35d8d65 (v0.9.6, WO-5.10)
Tier    : RED (money-adjacent / custody-authorization surface)
Status  : DO NOT MERGE — founder review.


0. FAILURES-FIRST (read this before the green)
-----------------------------------------------
Nothing failed at the final bytes. Every gate is green at dc86e8a (§H below).
The honest caveats — all by design, all logged in JOURNAL.md, none silent:

  • NAMED INTERIM DEBT (app-side actor allow-list). The payment-operator gate
    ^ops:payment:[A-Za-z0-9._:-]+$ is enforced in app code (src/breakglass/
    issue.ts), NOT in canon, because canon is silent on the payment-operator
    namespace until WO-5.12. This is the founder's ruling (Beurni, 2026-07-13),
    logged as an interim debt whose executioner is a re-pin after canon WO-5.12
    lands the namespace. It is app-side ON PURPOSE, flagged, not hidden.

  • DEBT ① (carried, unchanged). The maker-checker type-level DistinctChecker
    guard is vacuous for runtime `string` ids (`string extends string`); for
    forged/runtime ids production rests on the runtime string-compare alone.
    Proven live in test/breakglass-issue.test.ts (same-identity via `any`
    bypass → MakerCheckerSameIdentityError).

  • DEBT ② (carried, unchanged). approve() re-asserts
    command.envelope.actor === command.maker.id (maker-checker.ts:143). The
    forged-envelope test drives exactly this line.

  • DOWNSTREAM STATES ARE « EN ATTENTE », NOT MODELED. request→approve reaches
    only operator_verifying. provider_confirmed / issued / consumed render as
    « en attente » — the console does NOT advance them. The fourth secret
    (signature) is born at issuance (E3-gated), so it is absent from the request
    shape and unreachable in this console (§D).

If any of the above is not acceptable as an interim, this slice does not merge.


1. WHAT'S IN THIS PACKET
------------------------
  README.txt .................. this index
  HEAD-ANCHOR.txt ............. rev-parse HEAD vs ls-remote origin (self-anchor)
  diff.txt .................... full diff origin/main..dc86e8a (986 lines)
  JOURNAL.md .................. the committed journal @ dc86e8a (debts + rulings)
  VERIFIER-VERDICT.txt ........ fresh-context verifier, verbatim (A–H PASS)
  COLD-PROOF.txt .............. warm + clean-HOME cold isolation proof, auth line shown
  logs/red-proof.txt .......... the adversarial test FAILING before impl existed
  logs/branch-log.txt ......... one-commit log + file stat
  gates/ ...................... captured gate output (see §H)


2. HOW TO READ IT (verify, don't trust)
---------------------------------------
  1. HEAD-ANCHOR.txt — confirm dc86e8a == origin (don't trust this prose).
  2. logs/red-proof.txt — the test could not pass vacuously (module absent → load fail).
  3. diff.txt — read the actual bytes against the DoD below.
  4. VERIFIER-VERDICT.txt — a fresh context re-ran the subversions and reports A–H.
  5. COLD-PROOF.txt — a clean $HOME, frozen lockfile, GUARD 0.9.6, all gates green.


3. DoD CHECKLIST (WO-OPS-1b)
----------------------------
  [x] breakglass:issue is a real command — request→approve, two operators,
      consuming canon HandoffAuthorization field schemas (Id/Fcfa/IsoTimestamp,
      HANDOFF_AUTHORIZATION_STATES). No fabricated shape. .... diff.txt, §A/§B
  [x] Actor allow-list ^ops:payment:[A-Za-z0-9._:-]+$ enforced at BOTH halves;
      every other actor refused by non-match. Refusal fixtures: supplier:aicha,
      sera's REAL logistics-service:dispatch, ops:moderation:diallo,
      empty-suffix ops:payment: ......................... §B, test file
  [x] maker-checker seam holds — same identity unrepresentable (type-test) +
      runtime refused; forged envelope refused at approve ... §C
  [x] The fourth secret (signature) is absent from the request and unreachable
      in the console (code + runtime + e2e) ............... §D
  [x] provider_confirmed/issued/consumed render « en attente », not modeled .. §E
  [x] Desk 5 live; the other SIX desks stay honest empty shells; all 8
      descriptors import only ./types ..................... §F, desk-isolation
  [x] No leaked franc beyond the operator-verified exactAmount (canon Fcfa,
      passed through untouched); no fee/commission/total/price; audit-log.ts
      and moderation/decide.ts byte-identical to 1a ....... §G
  [x] RED discipline: adversarial tests FIRST, red-proof captured ... logs/red-proof.txt
  [x] Warm + clean-HOME cold, auth line shown, GUARD 0.9.6 .......... COLD-PROOF.txt
  [x] Fresh-context verifier on the final bytes: A–H PASS ........... VERIFIER-VERDICT.txt


(§A–§H refer to the section labels in VERIFIER-VERDICT.txt.)
