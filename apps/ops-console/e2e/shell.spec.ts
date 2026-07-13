import { expect, test } from '@playwright/test';
import { sharedColour } from '@platform/ui-tokens';

/**
 * WO-OPS-0 DoD: "the eight routes render with honest empty states." This drives
 * the REAL built console in a real Chromium. The console runs on the shared/
 * neutral palette (no `platform` theme exists) — ink on warm paper.
 */

function hexToRgb(hex: string): string {
  const n = hex.replace('#', '');
  return `rgb(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)})`;
}

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

const EMPTY = "Aucune donnée — cet établi n'est pas encore branché.";

test('the shell boots on the shared/neutral palette with catalog strings', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Console Ops — Platform');

  const brand = page.locator('h1');
  await expect(brand).toHaveText('Console Ops');
  // Grand Teint: the brand is ink; the page sits on warm sand.
  await expect(brand).toHaveCSS('color', hexToRgb(sharedColour.ink));
  await expect(page.locator('body')).toHaveCSS('background-color', hexToRgb(sharedColour.sand));

  // All eight desks are present in the nav, each an icon + word (glyph + label).
  await expect(page.locator('nav .desk-link')).toHaveCount(8);
  await expect(page.locator('nav .desk-link .glyph svg')).toHaveCount(8);
});

test('every one of the eight desks renders its title and the HONEST empty state', async ({
  page,
}) => {
  for (const desk of DESKS) {
    await page.goto(`/#/${desk.slug}`);
    await expect(page.locator('.desk-title')).toHaveText(desk.title);
    await expect(page.locator('.empty-state')).toHaveText(EMPTY);
    // the active nav item is marked (aria-current)
    await expect(page.locator(`.desk-link[data-id="${desk.slug}"]`)).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('an unknown route falls back to the first desk — never a blank or fabricated screen', async ({
  page,
}) => {
  await page.goto('/#/does-not-exist');
  await expect(page.locator('.desk-title')).toHaveText('Fonds de protection');
  await expect(page.locator('.empty-state')).toHaveText(EMPTY);
});
