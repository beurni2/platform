import { expect, test } from '@playwright/test';
import { sharedColour, money } from '@platform/ui-tokens';

/** Mirror src/breakglass/board-view.ts formatFcfa — verify the rendered amount. */
function fcfa(amount: number): string {
  const digits = String(amount);
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += money.groupSeparator;
    grouped += digits[i];
  }
  return grouped + money.currencySuffix;
}

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

// The five desks that stay honest shells (everything except the three live
// desks: moderation + reconciliation-operateur + echelle-de-refus).
const SHELL_DESKS: ReadonlyArray<{ slug: string; title: string }> = [
  { slug: 'fonds-de-protection', title: 'Fonds de protection' },
  { slug: 'reclamations', title: 'Réclamations' },
  { slug: 'confiance-securite', title: 'Confiance & sécurité' },
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

test('the five remaining desks stay honest empty shells (no live surface leaks in)', async ({
  page,
}) => {
  for (const desk of SHELL_DESKS) {
    await page.goto(`/#/${desk.slug}`);
    await expect(page.locator('.desk-title')).toHaveText(desk.title);
    await expect(page.locator('.empty-state')).toHaveText(EMPTY);
    // no live desk (moderation queue, break-glass board, refusal ladder) may leak in.
    await expect(page.locator('.mod-queue')).toHaveCount(0);
    await expect(page.locator('.bg-case')).toHaveCount(0);
    await expect(page.locator('.rf-list')).toHaveCount(0);
  }
});

test('DESK 5 (reconciliation-operateur) is live — the break-glass case: both operators, amount, « en attente » downstream', async ({
  page,
}) => {
  await page.goto('/#/reconciliation-operateur');
  await expect(page.locator('.desk-title')).toHaveText('Réconciliation opérateur');
  await expect(page.locator('.empty-state')).toHaveCount(0);
  await expect(page.locator('.mod-queue')).toHaveCount(0);
  await expect(page.locator('.bg-case')).toHaveCount(1);

  // both operators named (maker-checker — two different people)
  await expect(page.locator('.bg-requested-by .bg-value')).toHaveText('ops:payment:sanou');
  await expect(page.locator('.bg-approved-by .bg-value')).toHaveText('ops:payment:zerbo');
  // the operator-verified amount (canon money format; it never leaves this console)
  await expect(page.locator('.bg-amount .bg-value')).toHaveText(fcfa(12500));

  // request→approve reached; provider-confirm / issuance / consumption are « en attente »
  await expect(page.locator('.bg-step-status--current')).toHaveText('En cours');
  const pending = page.locator('.bg-step-status--pending');
  await expect(pending).toHaveCount(3); // provider_confirmed, issued, consumed
  await expect(pending.first()).toHaveText('En attente');

  // THE FOURTH SECRET is never rendered
  await expect(page.getByText(/signature/i)).toHaveCount(0);
});

test('DESK 6 (echelle-de-refus) is live — the refusal ladder: rungs, eligibility, custody-of-truth verbatim, no lever', async ({
  page,
}) => {
  await page.goto('/#/echelle-de-refus');
  await expect(page.locator('.desk-title')).toHaveText('Échelle de refus');
  await expect(page.locator('.empty-state')).toHaveCount(0);
  await expect(page.locator('.mod-queue')).toHaveCount(0);
  await expect(page.locator('.bg-case')).toHaveCount(0);

  // the four rungs render as a legend — the ladder, best → most restricted (trend)
  await expect(page.locator('.rf-legend .rf-legend-rung')).toHaveCount(4);
  // one buyer per rung — the degradation across the population
  await expect(page.locator('.rf-list .rf-row')).toHaveCount(4);
  for (const rung of ['good_standing', 'deposit_required', 'prepay_only', 'suspended']) {
    await expect(page.locator(`.rf-row[data-rung="${rung}"]`)).toHaveCount(1);
  }

  // good standing is « permis », suspended is « restreint »
  await expect(page.locator('.rf-row[data-rung="good_standing"] .rf-elig--allowed')).toHaveCount(1);
  await expect(page.locator('.rf-row[data-rung="suspended"] .rf-elig--restricted')).toHaveCount(1);

  // CUSTODY OF TRUTH — a seeded reason renders verbatim
  await expect(page.getByText('Refus répétés — paiement à la porte suspendu')).toBeVisible();
  // the deposit rung shows the required amount in canon money format
  await expect(page.locator('.rf-row[data-rung="deposit_required"] .rf-deposit .rf-value')).toHaveText(
    fcfa(2000),
  );

  // NO LEVER — the desk content carries no interactive control (render-only)
  await expect(
    page.locator('.desk-content button, .desk-content input, .desk-content form, .desk-content [contenteditable]'),
  ).toHaveCount(0);
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
