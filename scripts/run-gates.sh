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

log "gate: contracts drift-check — pinned /docs copy vs canon manifest v0.9.1 (must pass)"
capture drift-check-positive pass pnpm exec drift-check docs --pinned-version 0.9.1

log "gate: contracts drift-check — TAMPERED consumer doc (must fail)"
DRIFT_TMP="$(mktemp -d)"
cp -r docs "$DRIFT_TMP/docs"
printf '\nrogue edit — this consumer copy drifted from canon\n' >> "$DRIFT_TMP/docs/ECOSYSTEM-MASTER-REFERENCE.md"
capture drift-check-negative fail pnpm exec drift-check "$DRIFT_TMP/docs" --pinned-version 0.9.1
rm -rf "$DRIFT_TMP"

log "ops console — Playwright harness (eight routes render honest empty states)"
capture playwright-e2e pass pnpm --filter @platform/ops-console test:e2e

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "ONE OR MORE GATES FAILED"
  exit 1
fi
echo ""
echo "ALL GATES GREEN (positives passed; every negative fixture failed as required)"
