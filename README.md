> **OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent. Chaque action est une commande permissionnée, événementielle et auditée. Maker-checker — deux personnes différentes — sur tout ce qui touche à l'argent ou à la garde. Si un humain peut déplacer un franc en silence, toutes les promesses de ce système sont du théâtre.**

# platform — the Boutik+ × Shop+ × Séra ops console

The cross-app back-office (**founder decision D22**, ratified 2026-07-11 — the
repo's real name is `platform`). It is the home the canon's Part 9 called for:
the Protection Fund, claims, moderation, trust & safety, provider
reconciliation, the refusal ladder, flags/kill-switches, and the audit log —
functions that are *inherently cross-domain* and cannot live inside any one
app without that app becoming a de-facto platform brain
(`ECOSYSTEM-MASTER-REFERENCE.md` §9, decision register).

This repo **consumes** canon (`@platform/*`) at a **pinned git sha**; it never
defines canon. It reads through the authoritative services and **never writes
another domain's database.**

## What exists today (WO-OPS-0 — the shell and the spine)

- **The eight desks as routes**, each with an honest empty state
  (« Aucune donnée — cet établi n'est pas encore branché. »). No desk is wired
  to real data; no command exists yet. An empty desk that says so is correct;
  a desk showing fabricated data would be a defect.
- **The maker-checker primitive** (`apps/ops-console/src/maker-checker.ts`) —
  a command cannot be both issued and approved by the same identity. The
  same-identity attempt is a **type-level impossibility** (it does not compile)
  **and** a **runtime refusal** (it throws). Both are proven.
- **The audit-log primitive** (`apps/ops-console/src/audit-log.ts`) —
  append-only: who · what · why · when · against which entity · with what
  evidence. An entry cannot be mutated or deleted; both are proven.
- **The ops action-type** (`apps/ops-console/src/ops-action.ts`) — the "what"
  the two primitives carry. Canon's closed `EVENT_NAMES` registry has no
  ops-command event and canon forbids inventing one, so this is NOT canon: a
  **quarantined local closed union — a named debt**, one debt sentinel today, to
  be derived later from commands that actually exist (**CTO ruling, 2026-07-13**;
  see JOURNAL.md).

## Canon pin

All `@platform/*` packages are pinned to platform-contracts
**`04af4b5266d53866a2b6d5800e270d3fffac2b35`** (canon **v0.9.4**; its canon
commit message records "founder review passed"). The pin was supplied by the
CTO in-session (**CTO ruling, 2026-07-13** — WO-OPS-0.1 re-pin; the original
WO-OPS-0 pin was `4440ce0` / v0.9.1). This repo consumes that pin; it never
edits canon. Moving the pin is a deliberate, reviewed change across
`apps/ops-console/package.json` + `pnpm-workspace.yaml` + the `/docs` copy, in
one PR (see `CONSUMING.md` in platform-contracts) — the drift-check's
`--pinned-version` is derived from the installed package so the doc anchor
follows the sha automatically.

## Layout

```
apps/ops-console/         # the console (vanilla TS + Vite, zero framework)
  src/desks/              # the eight desks (each carries the law at its head)
  src/maker-checker.ts    # the spine — two different people, or it does not happen
  src/audit-log.ts        # the spine — append-only; nobody "corrects" in silence
docs/                     # pinned canon copy, drift-checked in CI
scripts/run-gates.sh      # every gate, positives + negative fixtures
```

## Gates (run `pnpm gates`)

`typecheck` (incl. the maker-checker compile-impossibility type-test) ·
`tests` (maker-checker runtime refusal · audit append-only · icon fidelity ·
catalog) · `zero-hardcode scan` · French Voice `copy-lint` · contracts
`drift-check` · Playwright shell e2e — each with a negative fixture that must
fail.
