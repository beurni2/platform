WO-OPS-DESK-6 — EVIDENCE PACKET — the refusal-oversight read model
==================================================================
Slice   : WO-OPS-DESK-6 (AMBER) — Desk 6 (echelle-de-refus) goes live as a
          RENDER-ONLY read model over canon PayAtDoorEligibility. No command,
          no lever; the OpsActionType union does not grow.
Repo    : github.com/beurni2/platform
Branch  : claude/platform-ops-console-90txec
HEAD    : 7f95ae7  (journal)  — code commit 2a3f005 — == origin (HEAD-ANCHOR.txt)
Rides   : GP-OPS grounding 3207770 (JOURNAL-only) also sits on this branch,
          unmerged; it merges with this slice unless pulled out first.
Base    : merged main 1176f69 — no re-pin (canon stays v0.9.8 / 67bda02)
Tier    : AMBER (render-only; no money lever, no command)
Status  : DO NOT MERGE — founder review.


0. FAILURES-FIRST (read this before the green)
-----------------------------------------------
Nothing failed at the final bytes; all gates green at 7f95ae7 (§F). The honest
caveats, all by design and journaled:

  • TRANSPORT GAP (flagged, not invented). PayAtDoorEligibility is emitted
    INSIDE shop-plus (16 hits) and does NOT reach platform's boundary — there
    is no live feed here. Per the WO's derive-or-stop, the gap is FLAGGED: the
    desk renders a labelled preview (« Aperçu ») seeded from a DATA file
    (src/refusal/preview.json), each record parsed through the REAL canon
    PayAtDoorEligibilitySchema (shape-true or it throws). No feed is faked. A
    real shop feed replaces preview.json at a later integration slice.

  • DEMO DATA, HONESTLY FRAMED. At zero real orders this desk watches DEMO
    refusals — the preview, not a live population. It is built now so the eyes
    exist before the traffic does (the ladder is an operational safety
    mechanism). Its meaning arrives with the pilot's first live day.

  • ONE DERIVED VALUE mirrors shop. rung + eligibility are derived following
    shop's OWN pay-at-door precedence (state → prepay → deposit), quoted from
    shop-plus/packages/commerce-core/src/pay-at-door-policy.ts. Every other
    field is carried VERBATIM. This is a mirror of a decision shop already made;
    it touches no franc and makes no new decision.

If the founder does not accept a demo-now desk with the feed deferred, this
slice waits — the code is correct, the data source is the open question.


1. WHAT'S IN THIS PACKET
------------------------
  README.txt .................... this index
  HEAD-ANCHOR.txt ............... rev-parse HEAD vs ls-remote origin
  diff.txt ...................... full diff origin/main..7f95ae7 (999 lines;
                                  includes the GP-OPS grounding that rides the branch)
  JOURNAL.md .................... committed journal (WO-OPS-DESK-6 entry + honest framing)
  VERIFIER-VERDICT.txt .......... fresh-context verifier, verbatim (A–F)
  COLD-PROOF.txt ................ warm + clean-HOME cold isolation, auth line shown
  desk6-echelle-de-refus.png .... the rendered desk (390px, low-end phone width)
  logs/branch-log.txt ........... the two-commit log + file stat
  gates/ ........................ captured gate output (see §F)


2. HOW TO READ IT (verify, don't trust)
---------------------------------------
  1. HEAD-ANCHOR.txt — confirm 7f95ae7 == origin.
  2. desk6-...png — the 5-second test: an operator sees the ladder degrading
     (bon standing → acompte → paiement d'avance → à la porte suspendu), each
     buyer's eligibility (permis/restreint) and reason verbatim. Trust register,
     no blame.
  3. diff.txt — the read model (ladder.ts) imports the canon TYPE only.
  4. VERIFIER-VERDICT.txt — a fresh context re-ran the subversions (A–F),
     including planting a lever to prove desk-isolation bites.
  5. COLD-PROOF.txt — fresh $HOME, frozen lockfile, GUARD 0.9.8, gates green.


3. DoD CHECKLIST (WO-OPS-DESK-6)
-------------------------------
  [x] Read model over the REAL emitted shape; derive-or-stop honoured — canon
      PayAtDoorEligibility consumed from own bytes; transport gap FLAGGED,
      no feed invented ............................ ladder.ts/sandbox.ts, §A/§C
  [x] Renders per-buyer ladder state · eligibility (allowed/restricted) · the
      refusal facts verbatim · trend (rung legend) ...... screenshot, e2e, §B
  [x] House pattern: read model import-TYPE-only; desk has NO lever; other five
      shells stay shells; desk-isolation extends ........ §A/§D
  [x] Fixed-clock gallery incl. the degradation render ... sandbox SANDBOX_NOW, §C
  [x] FIXTURES: view-cannot-write (type-test + pure/no-mutation) · ladder renders
      custody-of-truth verbatim · a planted mutation lever FAILS desk-isolation
      (verified live) ............................. §A/§B
  [x] French Voice, trust register; strings register-tagged; reason is DATA
      (preview.json), never inline ................. catalog + §E
  [x] Warm + clean-HOME cold, auth line shown, GUARD 0.9.8 ...... COLD-PROOF.txt
  [x] Fresh-context verifier on the final bytes: A–F ........... VERIFIER-VERDICT.txt


(§A–§F refer to the section labels in VERIFIER-VERDICT.txt.)
