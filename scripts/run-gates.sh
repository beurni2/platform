#!/usr/bin/env bash
# WO-OPS-0 CI gates, run end-to-end with evidence. Every gate with a negative
# fixture SHOWS it failing once per run — if a negative fixture stops failing
# (exit != 1 exactly), the run itself fails. Output is captured under
# EVIDENCE_DIR when set.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_DIR="${EVIDENCE_DIR:-}"
FAILED=0

log() { printf '\n=== %s ===\n' "$1"; }
capture() {
  # capture <name> <expected: pass|fail> <command...>
  # expected=fail requires exit code EXACTLY 1: a crashed or misinvoked gate
  # (exit 2+) must never pass for a working negative fixture.
  local name="$1" expected="$2"; shift 2
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ -n "$EVIDENCE_DIR" ]; then
    mkdir -p "$EVIDENCE_DIR"
    printf '$ %s\n%s\n(exit code: %d)\n' "$*" "$out" "$rc" > "$EVIDENCE_DIR/$name.txt"
  fi
  printf '%s\n(exit code: %d)\n' "$out" "$rc"
  if [ "$expected" = pass ] && [ $rc -ne 0 ]; then echo "GATE FAILED (expected pass): $name"; FAILED=1; fi
  if [ "$expected" = fail ] && [ $rc -ne 1 ]; then echo "GATE FAILED (expected the negative fixture to fail with exit 1, got $rc): $name"; FAILED=1; fi
  # An explicit NUMBER pins one exit code — the « gate could not see anything »
  # outcome (exit 2) is not the same as « found a violation » (exit 1).
  case "$expected" in
    ''|*[!0-9]*) ;;
    *) if [ $rc -ne "$expected" ]; then echo "GATE FAILED (expected exit $expected, got $rc): $name"; FAILED=1; fi ;;
  esac
}

cd "$ROOT"

# Preinstalled-browser fallback for the Playwright harness (sandbox only;
# GitHub CI installs its own browser instead).
if [ -z "${PW_EXECUTABLE:-}" ] && [ -e /opt/pw-browsers/chromium ] && [ -z "${CI:-}" ]; then
  export PW_EXECUTABLE=/opt/pw-browsers/chromium
fi

log "typecheck (app shell + the maker-checker COMPILE-impossibility type-test)"
capture typecheck pass pnpm typecheck

log "tests (maker-checker runtime refusal · audit append-only · icon fidelity · catalog · desks)"
capture tests pass pnpm test

log "gate: zero-hardcode scan — ops-console src consumes ui-tokens, no literals (must pass)"
capture zero-hardcode-positive pass node scripts/gates/no-hardcode.mjs

log "gate: zero-hardcode scan — NEGATIVE FIXTURE (hardcoded hex/px/rem/rgb, must fail)"
capture zero-hardcode-negative fail node scripts/gates/no-hardcode.mjs scripts/gates/fixtures/negative/hardcode

log "gate: French Voice copy-lint — ops-console catalog (must pass)"
capture copy-lint-positive pass pnpm exec copy-lint apps/ops-console/i18n/catalog.json

log "gate: French Voice copy-lint — NEGATIVE FIXTURE (veuillez/séquestre + marketing-in-money, must fail)"
capture copy-lint-negative fail pnpm exec copy-lint scripts/gates/fixtures/negative/catalog.negative.json

# AUDIT-B+1 F12, verifier round 3 — THE GATE THAT MAKES THE PIN LIVE.
# The existing negative fixture above fails under BOTH the old and the new token
# list (it carries « Veuillez » and « séquestre »), so it discriminates nothing:
# reverting @platform/i18n to the pre-F12 package left every board GREEN while
# the audit's escape passed again — proven by execution. This fixture's ONLY
# violation is one of the stems F12 added, so if the i18n pin ever regresses
# this entry stops failing and the board goes red. Enforced by construction,
# not by discipline (§4).
log "gate: French Voice copy-lint — NEGATIVE FIXTURE (administrative register, F12 — must fail)"
capture copy-lint-administrative fail pnpm exec copy-lint scripts/gates/fixtures/negative/catalog.administrative-register.json

# ACCENTS-INVISIBLES-1 (2026-11-27) — the banned words without their accent or
# with a hidden character. The canon lint now compares both sides folded
# (accents and invisible format characters removed; platform-contracts
# 34c1569). This fixture's ONLY violations are spellings the earlier pin lets
# through (measured against 199bc2a: 0 violations) — so a pin regression turns
# the board red, the way the F12 fixture above guards F12.
log "gate: French Voice copy-lint — NEGATIVE FIXTURE (no accent, hidden characters — must fail)"
capture copy-lint-accents fail pnpm exec copy-lint scripts/gates/fixtures/negative/catalog.accents.json


log "gate: lockfile URL-form — zero SSH-form git URLs in the committed lockfile (defense in depth; canon v0.9.4 standing law) (must pass)"
capture lockfile-url-form-positive pass node scripts/gates/no-ssh-git-url.mjs

log "gate: lockfile URL-form — NEGATIVE FIXTURE (planted git@github.com: url, must fail)"
capture lockfile-url-form-negative fail node scripts/gates/no-ssh-git-url.mjs scripts/gates/fixtures/negative/ssh-url/pnpm-lock.yaml

log "gate: deploy-tool-pinned — every workflow runs the lock file's wrangler, one exact version (must pass)"
capture deploy-tool-pinned-positive pass node scripts/gates/deploy-tool-pinned.mjs
for fx in npx-wrangler npx-quoted hash-in-string dlx-flag-first dlx-continued install-wrangler bare-wrangler bare-flag-first bare-continued bare-unlisted wrangler-action; do
  log "gate: deploy-tool-pinned — NEGATIVE FIXTURE ($fx, must fail)"
  capture "deploy-tool-pinned-negative-$fx" fail node scripts/gates/deploy-tool-pinned.mjs "scripts/gates/fixtures/negative/deploy-tool/$fx.yml"
done
log "gate: deploy-tool-pinned — NEGATIVE FIXTURE (a range instead of one exact version, must fail)"
capture deploy-tool-pinned-negative-range-pin fail node scripts/gates/deploy-tool-pinned.mjs scripts/gates/fixtures/negative/deploy-tool/range-pin/workflows scripts/gates/fixtures/negative/deploy-tool/range-pin
for fx in pinned-differently no-manifest; do
  log "gate: deploy-tool-pinned — NEGATIVE FIXTURE ($fx: two packages pin it differently / no package declares it, must fail)"
  capture "deploy-tool-pinned-negative-$fx" fail node scripts/gates/deploy-tool-pinned.mjs "scripts/gates/fixtures/negative/deploy-tool/$fx/workflows" "scripts/gates/fixtures/negative/deploy-tool/$fx"
done
log "gate: deploy-tool-pinned — NOTHING SEEN (no wrangler command: the gate must say so with exit 2, never pass)"
capture deploy-tool-pinned-nothing-seen 2 node scripts/gates/deploy-tool-pinned.mjs scripts/gates/fixtures/negative/deploy-tool/no-wrangler.yml

# ── THE STANDING LAWS, CHECKED HERE TOO ────────────────────────────────────
# The same law gates the three app repos run (copied, patterns byte-equal),
# with their fixtures under gates/. A gate added later is a gate that already
# let something through (CLAUDE.md §4).
log "gate: no-ML — repo deps (root manifest included) + imports (must pass)"
capture no-ml-libs-positive pass node scripts/gates/no-ml-libs.mjs

log "gate: no-ML — NEGATIVE FIXTURE (ML dep + inference import, must fail)"
capture no-ml-libs-negative fail node scripts/gates/no-ml-libs.mjs gates/fixtures/negative/no-ml-libs

# A run over the whole product reads the ROOT manifest too, and no fixture run
# does. This builds a throwaway layout with stub product roots and a root
# manifest carrying one banned dev dependency, and requires a refusal.
log "gate: no-ML — a banned dependency in the ROOT manifest only (must fail)"
NOML_TMP="$(mktemp -d)"
cleanup_noml() { rm -rf "$NOML_TMP"; }
trap cleanup_noml EXIT
for dir in apps services packages; do
  mkdir -p "$NOML_TMP/$dir"
  printf 'export const stub = 0;\n' > "$NOML_TMP/$dir/stub.ts"
done
printf '{\n  "name": "root-manifest-probe",\n  "private": true,\n  "devDependencies": { "@tensorflow/tfjs": "4.22.0" }\n}\n' > "$NOML_TMP/package.json"
capture no-ml-libs-negative-root-manifest fail bash -c 'cd "$1" && node "$2/scripts/gates/no-ml-libs.mjs"' _ "$NOML_TMP" "$ROOT"
cleanup_noml
trap - EXIT

log "gate: no-funds — repo source (the fund's own book passes only on its ruled lines) (must pass)"
capture no-funds-positive pass node scripts/gates/no-wallet-no-funds.mjs

log "gate: no-funds — NEGATIVE FIXTURE (wallet/balance module, must fail)"
capture no-funds-negative fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds

log "gate: no-funds — FRENCH FIXTURE ALONE (soldeVendeur/crediter, must fail)"
capture no-funds-negative-fr fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds/solde-vendeur.fr.ts

log "gate: no-funds — a seller's balance with its unit, on a claim record, ALONE (must fail)"
capture no-funds-negative-claim-seller-balance fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds/claim-seller-balance.ts

log "gate: no-funds — a seller's balance on a claim record, in French, ALONE (must fail)"
capture no-funds-negative-claim-seller-balance-fr fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds/reclamation-solde-vendeur.fr.ts

log "gate: no-funds — an earner's balance as a whole word, or with « In » before its unit, ALONE (must fail)"
capture no-funds-negative-earner-balance-forms fail node scripts/gates/no-wallet-no-funds.mjs gates/fixtures/negative/no-wallet-no-funds/earner-balance-forms.ts

# The fund's ruled lines are excused one exact line at a time, never a file.
# This copies one excused file into a temp folder, adds a seller's balance
# beside the fund's own, and requires the gate to refuse it. The app file in
# the repo is never touched. `vendeurBalance` trips ONLY the pattern the ruled
# line trips, so it is refused only because the excuse is pinned to a line;
# `sellerBalance` and `sellerBalanceFcfa` are a seller's balance, alone and
# with its unit.
for plant in vendeurBalance sellerBalance sellerBalanceFcfa; do
  log "gate: no-funds — a seller's balance ($plant) planted beside the fund's own ruled line (must fail)"
  PLANT_TMP="$(mktemp -d)"
  cleanup_plant() { rm -rf "$PLANT_TMP"; }
  trap cleanup_plant EXIT
  mkdir -p "$PLANT_TMP/apps/ops-console/src/fonds"
  cp apps/ops-console/src/fonds/view.ts "$PLANT_TMP/apps/ops-console/src/fonds/view.ts"
  printf '\nexport const %s = 0;\n' "$plant" >> "$PLANT_TMP/apps/ops-console/src/fonds/view.ts"
  capture "no-funds-negative-planted-beside-fund-book-$plant" fail bash -c 'cd "$1" && node "$2/scripts/gates/no-wallet-no-funds.mjs" apps/ops-console/src/fonds/view.ts' _ "$PLANT_TMP" "$ROOT"
  cleanup_plant
  trap - EXIT
done

# The fund-book test's ruled line is excused for the earner pattern as well,
# on that one exact line. This copies the test into a temp folder, adds a
# supplier's balance beside the line, and requires a refusal: `supplierBalance`
# trips ONLY the earner pattern, so it is refused only because that excuse is
# pinned to its line too.
log "gate: no-funds — a supplier's balance planted beside the fund-book test's ruled line (must fail)"
PLANT_TMP="$(mktemp -d)"
cleanup_plant() { rm -rf "$PLANT_TMP"; }
trap cleanup_plant EXIT
mkdir -p "$PLANT_TMP/services/protection-service/test"
cp services/protection-service/test/fund-book.e2e.test.ts "$PLANT_TMP/services/protection-service/test/fund-book.e2e.test.ts"
printf '\nexport const supplierBalance = 0;\n' >> "$PLANT_TMP/services/protection-service/test/fund-book.e2e.test.ts"
capture no-funds-negative-planted-beside-fund-book-test-supplierBalance fail bash -c 'cd "$1" && node "$2/scripts/gates/no-wallet-no-funds.mjs" services/protection-service/test/fund-book.e2e.test.ts' _ "$PLANT_TMP" "$ROOT"
cleanup_plant
trap - EXIT

# Every law gate scans an ALLOWLIST of roots, so a top-level directory nobody
# added would be scanned by nothing and reported by nothing. This plants a
# directory with a live violation in it and requires exit 2 ("gate could not
# run") — not exit 0.
log "gate: scan coverage — an UNCLASSIFIED top-level directory must break the build (exit 2)"
UNCLASSIFIED_DIR="$ROOT/zz-unclassified-coverage-probe"
cleanup_probe() { rm -rf "$UNCLASSIFIED_DIR"; }
trap cleanup_probe EXIT
rm -rf "$UNCLASSIFIED_DIR"; mkdir -p "$UNCLASSIFIED_DIR"
printf 'export const soldeVendeur = 0;\n' > "$UNCLASSIFIED_DIR/probe.ts"
capture scan-coverage-unclassified-dir 2 node scripts/gates/no-wallet-no-funds.mjs
cleanup_probe
trap - EXIT

log "gate: single-level — repo source (must pass)"
capture single-level-positive pass node scripts/gates/single-level.mjs

log "gate: single-level — NEGATIVE FIXTURE (downline/recruit, must fail)"
capture single-level-negative fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level

log "gate: single-level — FRENCH FIXTURE ALONE (second level in French, must fail)"
capture single-level-negative-fr fail node scripts/gates/single-level.mjs gates/fixtures/negative/single-level/reseau-multi-niveau.fr.ts

log "gate: single-level — POSITIVE FIXTURE (single-level parrainage is legal, must pass)"
capture single-level-legal-parrainage pass node scripts/gates/single-level.mjs gates/fixtures/single-level-legal

log "gate: no-seller-deposit — repo source (must pass)"
capture no-seller-deposit-positive pass node scripts/gates/no-seller-deposit.mjs

log "gate: no-seller-deposit — NEGATIVE FIXTURE (deposit demanded of an earner, must fail)"
capture no-seller-deposit-negative fail node scripts/gates/no-seller-deposit.mjs gates/fixtures/negative/no-seller-deposit

log "gate: no-seller-deposit — FRENCH FIXTURE ALONE (must fail)"
capture no-seller-deposit-negative-fr fail node scripts/gates/no-seller-deposit.mjs gates/fixtures/negative/no-seller-deposit/caution-vendeur.fr.ts

log "gate: no-seller-deposit — a seller's reserve or deposit on a claim record, ALONE (must fail)"
capture no-seller-deposit-negative-claim-seller-reserve fail node scripts/gates/no-seller-deposit.mjs gates/fixtures/negative/no-seller-deposit/claim-seller-reserve.ts

log "gate: no-seller-deposit — a seller's deposit on a claim record, in French, ALONE (must fail)"
capture no-seller-deposit-negative-claim-seller-reserve-fr fail node scripts/gates/no-seller-deposit.mjs gates/fixtures/negative/no-seller-deposit/reclamation-caution-vendeur.fr.ts

log "gate: no-seller-debit — repo source (the fund-book test's ruled lines only) (must pass)"
capture no-seller-debit-positive pass node scripts/gates/no-seller-debit.mjs

log "gate: no-seller-debit — NEGATIVE FIXTURE (money taken back from an earner, must fail)"
capture no-seller-debit-negative fail node scripts/gates/no-seller-debit.mjs gates/fixtures/negative/no-seller-debit

log "gate: no-seller-debit — FRENCH FIXTURE ALONE (must fail)"
capture no-seller-debit-negative-fr fail node scripts/gates/no-seller-debit.mjs gates/fixtures/negative/no-seller-debit/retenue-vendeur.fr.ts

log "gate: no-seller-debit — a seller charged on a decided claim, ALONE (must fail)"
capture no-seller-debit-negative-claim-seller-debit fail node scripts/gates/no-seller-debit.mjs gates/fixtures/negative/no-seller-debit/claim-seller-debit.ts

log "gate: no-seller-debit — a seller charged on a decided claim, in French, ALONE (must fail)"
capture no-seller-debit-negative-claim-seller-debit-fr fail node scripts/gates/no-seller-debit.mjs gates/fixtures/negative/no-seller-debit/reclamation-retenue-vendeur.fr.ts

# ── THE RETIRED NAMES (Ten Laws #10) ────────────────────────────────────────
# The same gate file, byte for byte, in every repository: the first step pins
# this copy to that file's sha256. The log lines here never spell the names:
# this script is one of the files the gate reads.
log "gate: retired-names — this copy is the shared file, byte for byte (sha256 pinned, must pass)"
RETIRED_NAMES_SHA256=cdfd920894e658fe040de5e3338349cd2a82ff2229917b0d524ec4df3f4102dd
capture retired-names-sha256 pass bash -c 'printf "%s  scripts/gates/retired-names.mjs\n" "$1" | sha256sum -c -' _ "$RETIRED_NAMES_SHA256"

log "gate: retired-names — every tracked file, the left-out paths printed (must pass)"
capture retired-names-positive pass node scripts/gates/retired-names.mjs

log "gate: retired-names — NEGATIVE FIXTURE (the retired names as words, a catalog line, identifiers, must fail)"
capture retired-names-negative fail node scripts/gates/retired-names.mjs gates/fixtures/negative/retired-names

# Each file alone. The escaped spaces, the escape before the first word, the
# HTML entity and the lowercase form each have a file of their own, so each
# one is refused on its own merits.
for fx in retired-words.ts catalog.retired-line.json catalog.escaped-spaces.json catalog.escaped-lead.json retired-markup.html retired-lowercase.ts retired-identifier.ts; do
  log "gate: retired-names — NEGATIVE FIXTURE ALONE ($fx, must fail)"
  capture "retired-names-negative-$fx" fail node scripts/gates/retired-names.mjs "gates/fixtures/negative/retired-names/$fx"
done

log "gate: retired-names — POSITIVE FIXTURE (ordinary French, the canon name with a possessive, must pass)"
capture retired-names-legal pass node scripts/gates/retired-names.mjs gates/fixtures/retired-names-legal

# The no-argument run reads every tracked file except the left-out paths, and
# no fixture run reads that list. This builds a throwaway git repository with
# the gate and one clean tracked file, plants the retired name in ONE tracked
# file at a time, and requires a refusal outside the list and a pass inside
# it, so both edges of the list are pinned.
SCOPE_TMP="$(mktemp -d)"
cleanup_scope() { rm -rf "$SCOPE_TMP"; }
trap cleanup_scope EXIT
SCOPE_LINE="$(printf 'Ouvrir Mo%s Shop' n)"
probe_scope() {
  # probe_scope <pass|fail> <the one tracked path that carries the name>
  local expected="$1" rel="$2" repo="$SCOPE_TMP/repo"
  rm -rf "$repo"; mkdir -p "$repo/scripts/gates" "$repo/$(dirname "$rel")"
  cp scripts/gates/retired-names.mjs "$repo/scripts/gates/retired-names.mjs"
  printf 'clean\n' > "$repo/clean.txt"
  printf '%s\n' "$SCOPE_LINE" > "$repo/$rel"
  git -C "$repo" init -q && git -C "$repo" add -A
  log "gate: retired-names — the name planted in $rel only, in a throwaway repository (must $expected)"
  capture "retired-names-scope-$(printf '%s' "$rel" | tr '/.' '__')" "$expected" bash -c 'cd "$1" && node scripts/gates/retired-names.mjs' _ "$repo"
}
for rel in apps/x.ts services/x.ts packages/x.ts scripts/x.sh README.md docs/runbooks/x.md; do probe_scope fail "$rel"; done
for rel in design-reference/x.jsx docs/Sera-Build-Spec.md; do probe_scope pass "$rel"; done
cleanup_scope
trap - EXIT

log "gate: fr-pattern-coverage — every banned pattern is exercised by a fixture (must pass)"
capture fr-pattern-coverage pass node scripts/gates/fr-pattern-coverage.mjs

# The coverage gate must be shown failing too: this corrupts the roster in
# place, restored from a temp copy whatever happens, and requires a refusal.
log "gate: fr-pattern-coverage — NEGATIVE (a gutted roster must be refused)"
ROSTER_BAK="$(mktemp)"
cp gates/pattern-roster.json "$ROSTER_BAK"
restore_roster() { cp "$ROSTER_BAK" gates/pattern-roster.json; rm -f "$ROSTER_BAK"; }
trap restore_roster EXIT
node -e 'const f="gates/pattern-roster.json";const fs=require("fs");const r=JSON.parse(fs.readFileSync(f,"utf8"));const k=Object.keys(r)[0];r[k][0].regex="/zzgutted/";fs.writeFileSync(f,JSON.stringify(r,null,2));'
capture fr-pattern-coverage-negative fail node scripts/gates/fr-pattern-coverage.mjs
restore_roster
trap - EXIT

# DEBT ③ CLOSED: the drift-check's version anchor is DERIVED from the installed
# @platform/contracts (which the sha pin determines) — no hand-kept string. The
# CLI already refuses when --pinned-version != the manifest's packageVersion, so
# a stale or mismatched version fires (proven by the negative below).
PIN_VERSION="$(node -p "require('@platform/contracts/package.json').version")"
log "gate: contracts drift-check — /docs vs canon manifest at the INSTALLED version ($PIN_VERSION, DERIVED — debt ③) (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version "$PIN_VERSION"

log "gate: contracts drift-check — TAMPERED consumer doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/ECOSYSTEM-MASTER-REFERENCE.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version "$PIN_VERSION"
rm -rf "$DRIFT_TMP"

log "gate: drift-check version coupling (debt ③) — NEGATIVE (planted version mismatch vs installed, must fail)"
capture drift-check-version-mismatch-negative fail pnpm exec drift-check docs --pinned-version 0.0.0-planted-mismatch

log "ops console — Playwright harness (eight routes render honest empty states)"
capture playwright-e2e pass pnpm --filter @platform/ops-console test:e2e

# ═══ RELEASES STAY SAFE — the release chain, its guard, the publish rule, the daily watch ═══
# Ported from Boutik+: actions pinned, no npx beyond the named exact one,
# permissions declared, no secret pasted into a script, every service release
# starts with its guard. Each negative fixture breaks ONE rule and is scanned
# alone, so every rule is shown failing by itself.
log "gate: deploy-chain-locked — the repo's workflows (must pass)"
capture deploy-chain-locked-positive pass node scripts/gates/deploy-chain-locked.mjs

log "gate: deploy-chain-locked — POSITIVE FIXTURE (a legal deploy workflow, must pass)"
capture deploy-chain-locked-legal pass node scripts/gates/deploy-chain-locked.mjs scripts/gates/fixtures/deploy-chain-legal.yml

for fx in scripts/gates/fixtures/negative/deploy-chain/*.yml; do
  n="$(basename "$fx" .yml)"
  log "gate: deploy-chain-locked — NEGATIVE FIXTURE ALONE ($n, must fail)"
  capture "deploy-chain-locked-negative-$n" fail node scripts/gates/deploy-chain-locked.mjs "$fx"
done

# The release rules: a service release starts with its guard and waits in
# `production`; an app publish follows a green ci on main and never cancels;
# the rollback only rolls back; the board runs daily. One legal folder, and
# one negative folder per rule, each breaking that rule alone.
log "gate: deploy-chain-locked — POSITIVE FIXTURE (a legal set of release workflows, must pass)"
capture release-chain-legal pass node scripts/gates/deploy-chain-locked.mjs scripts/gates/fixtures/release-chain-legal

for fx in scripts/gates/fixtures/negative/release-chain/*/; do
  n="$(basename "$fx")"
  log "gate: deploy-chain-locked — NEGATIVE RELEASE FIXTURE ALONE ($n, must fail)"
  capture "release-chain-negative-$n" fail node scripts/gates/deploy-chain-locked.mjs "$fx"
done

# The guard, the publish decision and the watch run only on GitHub; each proof
# drives the REAL script against a local repository and local stand-ins.
log "gate: deploy-only-main — proof of the first step of every deploy (must pass)"
capture deploy-only-main-proof pass node scripts/gates/deploy-only-main-proof.mjs


log "gate: live-watch — proof of the daily « live runs main » watch (must pass)"
capture live-watch-proof pass node scripts/gates/live-watch-proof.mjs

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
