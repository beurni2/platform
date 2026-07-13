import { expect, test } from '@playwright/test';
import { sharedColour } from '@platform/ui-tokens';

/**
 * WO-OPS-0 / WO-OPS-1a DoD. Drives the REAL built console in a real Chromium.
 * Seven desks stay honest empty shells; DESK 3 (moderation) is live and renders
 * the queue (pending / decided, reasons verbatim). The console runs on the
 * shared/neutral palette — ink on warm paper.
 */

function hexToRgb(hex: string): string {
  const n = hex.replace('#', '');
  return `rgb(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)})`;
}

// The seven desks that stay honest shells (everything except moderation).
const SHELL_DESKS: ReadonlyArray<{ slug: string; title: string }> = [
  { slug: 'fonds-de-protection', title: 'Fonds de protection' },
  { slug: 'reclamations', title: 'Réclamations' },
  { slug: 'confiance-securite', title: 'Confiance & sécurité' },
  { slug: 'reconciliation-operateur', title: 'Réconciliation opérateur' },
  { slug: 'echelle-de-refus', title: 'Échelle de refus' },
  { slug: 'flags-kill-switches', title: 'Flags & kill-switches' },
  { slug: 'journal-audit', title: "Journal d'audit" },
];
const EMPTY = "Aucune donnée — cet établi n'est pas encore branché.";

test('the shell boots on the shared/neutral palette with catalog strings', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Console Ops — Platform');
  const brand = page.locator('h1');
  await expect(brand).toHaveText('Console Ops');
  await expect(brand).toHaveCSS('color', hexToRgb(sharedColour.ink));
  await expect(page.locator('body')).toHaveCSS('background-color', hexToRgb(sharedColour.sand));
  await expect(page.locator('nav .desk-link')).toHaveCount(8);
  await expect(page.locator('nav .desk-link .glyph svg')).toHaveCount(8);
});

test('the seven non-moderation desks stay honest empty shells (no queue leaks in)', async ({
  page,
}) => {
  for (const desk of SHELL_DESKS) {
    await page.goto(`/#/${desk.slug}`);
    await expect(page.locator('.desk-title')).toHaveText(desk.title);
    await expect(page.locator('.empty-state')).toHaveText(EMPTY);
    // Desk 3 going live must not have leaked into any other desk.
    await expect(page.locator('.mod-queue')).toHaveCount(0);
  }
});

test('DESK 3 (moderation) is live — renders the queue: pending / decided, reasons verbatim', async ({
  page,
}) => {
  await page.goto('/#/moderation');
  await expect(page.locator('.desk-title')).toHaveText('Modération');
  // it is a queue, not an empty shell
  await expect(page.locator('.empty-state')).toHaveCount(0);
  await expect(page.locator('.mod-queue .mod-item')).toHaveCount(3);
  await expect(page.getByText('Deux personnes valident — jamais la même.')).toBeVisible();

  // the three honest states
  await expect(page.locator('.mod-state--pending')).toHaveText('En attente');
  await expect(page.locator('.mod-state--approved')).toHaveText('Approuvé');
  await expect(page.locator('.mod-state--changes_requested')).toHaveText('Corrections demandées');

  // reasons rendered VERBATIM (every cited reason, in French Voice)
  const reasons = page.locator('.mod-reason');
  await expect(reasons).toHaveCount(2);
  await expect(reasons.nth(0)).toHaveText('Prix ou contact sur la photo');
  await expect(reasons.nth(1)).toHaveText('Emballage non neutre');
});

test('an unknown route falls back to the first desk — a shell, never blank or fabricated', async ({
  page,
}) => {
  await page.goto('/#/does-not-exist');
  await expect(page.locator('.desk-title')).toHaveText('Fonds de protection');
  await expect(page.locator('.empty-state')).toHaveText(EMPTY);
  await expect(page.locator('.mod-queue')).toHaveCount(0);
});
