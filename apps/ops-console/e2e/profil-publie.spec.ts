import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * PROFIL-PUBLIÉ (founder ruling 2026-09-30: « No live pages should show any
 * test mode banner. Retire them. ») — the console Pages SERVES is built the
 * way the deploy builds it, and no desk may wear a preview ribbon there.
 *
 * Before this, four desks of the live console wore « APERÇU — BAC À SABLE »
 * (or their own « Aperçu — … » note) over sample records: a moderation queue,
 * a break-glass case with two named operators, a refusal ladder of buyers, and
 * — without its base URL — the fund book. Taking the ribbon off and leaving
 * the samples would pass invented records as real, so on the published
 * profile a desk with no live source is the honest empty shell the other four
 * already were. The preview (profile unset: `vite dev`, and the build
 * `shell.spec.ts` walks) keeps its ribboned samples — that is the CONTROL.
 *
 * This walk drives a SECOND build served on :4274 with the value the deploy
 * step sets, and first checks the deploy step really sets it.
 */

const PUBLIE = 'http://127.0.0.1:4274';
const EMPTY = "Aucune donnée — cet établi n'est pas encore branché.";
const DESKS: ReadonlyArray<{ slug: string; title: string }> = [
  { slug: 'fonds-de-protection', title: 'Fonds de protection' },
  { slug: 'reclamations', title: 'Réclamations' },
  { slug: 'moderation', title: 'Modération' },
  { slug: 'confiance-securite', title: 'Confiance & sécurité' },
  { slug: 'reconciliation-operateur', title: 'Réconciliation opérateur' },
  { slug: 'echelle-de-refus', title: 'Échelle de refus' },
  { slug: 'flags-kill-switches', title: 'Flags & kill-switches' },
  { slug: 'journal-audit', title: "Journal d'audit" },
];

test('the deploy builds the published profile — a literal in the build step, readable in review', () => {
  const wf = readFileSync(join(import.meta.dirname, '..', '..', '..', '.github', 'workflows', 'ops-console-deploy.yml'), 'utf8');
  const debut = wf.indexOf('- name: Build');
  expect(debut, 'the build step is not in the deploy workflow').toBeGreaterThanOrEqual(0);
  const step = wf.slice(debut);
  const finEnv = step.indexOf('\n        run:');
  expect(finEnv, 'the build step has no run: line').toBeGreaterThan(0);
  // the env block of THE build step (it ends where its run: begins) — never a comment
  expect(step.slice(0, finEnv)).toMatch(/^\s+VITE_PROFILE: 'production'$/m);
});

test('on the published profile no desk wears a preview ribbon, none shows sample records, and every desk is reached by its link', async ({
  page,
}) => {
  await page.goto(`${PUBLIE}/`);
  await expect(page.locator('h1')).toHaveText('Console Ops');
  for (const desk of DESKS) {
    // reached the way he reaches it: the nav link, not a typed address
    await page.locator(`nav .desk-link[data-id="${desk.slug}"]`).click();
    await expect(page.locator('.desk-title')).toHaveText(desk.title);
    await expect(page.locator('.mod-ribbon'), `${desk.slug} wears a ribbon`).toHaveCount(0);
    await expect(page.getByText(/bac à sable|aperçu/i), `${desk.slug} says it is a preview`).toHaveCount(0);
    // no sample surface: no fund figures, queue, break-glass case or ladder
    await expect(page.locator('.fd-fund, .mod-queue, .bg-case, .rf-list')).toHaveCount(0);
    await expect(page.locator('.empty-state')).toHaveText(EMPTY);
  }
});
