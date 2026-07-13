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

## What exists today (WO-OPS-0 shell + spine · WO-OPS-1a Desk 3 live)

- **The eight desks as routes.** Seven remain honest empty shells
  (« Aucune donnée — cet établi n'est pas encore branché. »). **Desk 3
  (moderation) is LIVE** — it renders the moderation queue (pending / decided,
  reasons verbatim) from the real command path. A shell that says so is correct;
  a desk showing fabricated data would be a defect.
- **The maker-checker primitive** (`apps/ops-console/src/maker-checker.ts`) —
  a command cannot be both issued and approved by the same identity: a
  **type-level impossibility** (does not compile) for literal ids **and** a
  **runtime refusal** (throws). Named debt ① (WO-OPS-0, closed as documented
  WO-OPS-1a): for runtime `string` ids the type guard is vacuous, so production
  rests on the runtime check alone — proven on the real command under an `any`
  bypass. Debt ② (closed WO-OPS-1a): approve() re-asserts the issued envelope's
  actor is the maker, so a hand-built command with a lying envelope is refused.
- **The audit-log primitive** (`apps/ops-console/src/audit-log.ts`) —
  append-only: who · what · why · when · against which entity · with what
  evidence. An entry cannot be mutated or deleted; both are proven.
- **The first real ops command** (`apps/ops-console/src/moderation/decide.ts`) —
  `moderation:decide`: a reviewing operator decides (canon
  `ModerationDecisionSchema`; a supplier is refused at the schema — no
  self-moderation), a **second** operator approves (supplier refused there too),
  and the `command_id` is minted by canon `mintCommandId()`. The action-type
  (`apps/ops-console/src/ops-action.ts`) is a **quarantined local closed union**;
  its pending sentinel was retired for this real member.

## Canon pin

All `@platform/*` packages are pinned to platform-contracts
**`67bda02646019cb4ab28a16fadf388b522da2799`** (canon **v0.9.8** — the
payment-operator namespace: `ops:payment:*` allow-list, `authorizedBy`
constrained; its canon commit message records "founder review passed").
Founder-supplied in-session (WO-OPS-1c gate). Pin history:
`4440ce0`/v0.9.1 (WO-OPS-0) → `04af4b5`/v0.9.4 (WO-OPS-0.1) → `ba6f16d`/v0.9.6
(WO-OPS-1a) → `67bda02`/v0.9.8 (WO-OPS-1c). This repo consumes that pin; it
never edits canon. Moving the pin is a deliberate, reviewed change across
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
