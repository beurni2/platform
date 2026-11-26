import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { money } from '@platform/ui-tokens';

/**
 * THE LIVE FUND DESK, WALKED (CLAUDE.md §6bis, the screen is driven). The
 * console built against the REAL protection-service bundle on workerd
 * (playwright.config.ts: 4275 → 4276); nothing in between is stubbed. The
 * founder types his key at the door, the money fields refuse what is not
 * digits, a claim opens and joins the list, and he can take it to its next
 * step. Every outcome is asked of the service's own reads.
 *
 * Bound: this walk claims nothing about appearance — no layout, colour or
 * spacing. Those stay with the token, contrast and anatomy checks.
 */

test.use({ baseURL: 'http://127.0.0.1:4275' });

const SERVICE = 'http://127.0.0.1:4276';
// The test key the walk's service is started with (services/protection-service/test/serve-for-console-walk.mjs).
const WALK_KEY = 'test-fonds-walk-key-0001';
const INCOMPLETE = 'Il manque une information — vérifier chaque champ.';

function fcfa(amount: number): string {
  const digits = String(amount);
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += money.groupSeparator;
    grouped += digits[i];
  }
  return grouped + money.currencySuffix;
}

async function ledger<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${SERVICE}${path}`, { headers: { Authorization: `Bearer ${WALK_KEY}` } });
  expect(res.status()).toBe(200);
  return (await res.json()) as T;
}

type LedgerClaims = { claims: Array<{ claim: { orderId: string; amount: number; state: string } }> };
type LedgerFund = { declarationCount: number; declaration: { balanceFcfa: number } | null };

/** A refusal is seen fresh each time: clear the last note before the next try. */
async function clearFeedback(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelector('.fd-feedback')?.replaceChildren());
}

test('the founder opens the book, money fields take digits only, a claim opens, joins the list and moves on', async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith(SERVICE) && r.method() !== 'GET' && r.method() !== 'OPTIONS') {
      writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    }
  });

  await page.goto('/#/fonds-de-protection');
  await page.locator('input[name="cle"]').fill(WALK_KEY);
  await page.getByRole('button', { name: 'Ouvrir le registre' }).click();

  // ── open a claim: the amount refuses what is not digits ────────────────
  const openForm = page.locator('form.fd-form', { has: page.locator('input[name="montant"]') });
  await expect(openForm).toBeVisible();
  await openForm.locator('input[name="commande"]').fill('order-walk-001');
  await openForm.locator('input[name="motif"]').fill('jamais prete — commande annulee');
  await openForm.locator('input[name="preuve"]').fill('evb-walk-001');
  await openForm.locator('select').selectOption('seller');
  const feedback = page.locator('.fd-feedback .fd-note--error');
  for (const bad of ['', '12 500', '1e4', '0', '-5', '12.5']) {
    await clearFeedback(page);
    await openForm.locator('input[name="montant"]').fill(bad);
    await openForm.getByRole('button', { name: 'Enregistrer la réclamation' }).click();
    await expect(feedback, `claim amount ${JSON.stringify(bad)} is refused`).toHaveText(INCOMPLETE);
  }
  expect(writes).toEqual([]);
  expect((await ledger<LedgerClaims>(request, '/claims')).claims).toEqual([]);

  await openForm.locator('input[name="montant"]').fill('12500');
  await openForm.getByRole('button', { name: 'Enregistrer la réclamation' }).click();

  // …and it joins the claim list, read back from the book.
  const row = page.locator('li.fd-claim[data-order="order-walk-001"]');
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute('data-state', 'opened');
  await expect(row.locator('.fd-claim-amount')).toHaveText(fcfa(12_500));
  const afterOpen = await ledger<LedgerClaims>(request, '/claims');
  expect(afterOpen.claims).toHaveLength(1);
  expect(afterOpen.claims[0]?.claim).toMatchObject({ orderId: 'order-walk-001', amount: 12_500, state: 'opened' });

  // The next step is reachable: the claim goes under review.
  await row.getByRole('button', { name: 'Passer en examen' }).click();
  await expect(page.locator('li.fd-claim[data-order="order-walk-001"]')).toHaveAttribute('data-state', 'under_review');
  expect((await ledger<LedgerClaims>(request, '/claims')).claims[0]?.claim.state).toBe('under_review');

  // ── declare the balance: both money fields refuse what is not digits ───
  const declForm = page.locator('form.fd-form', { has: page.locator('input[name="solde"]') });
  const declare = declForm.getByRole('button', { name: 'Enregistrer le solde daté' });
  for (const bad of ['', '12 500', '1e4']) {
    await clearFeedback(page);
    await declForm.locator('input[name="solde"]').fill(bad);
    await declare.click();
    await expect(feedback, `balance ${JSON.stringify(bad)} is refused`).toHaveText(INCOMPLETE);
  }
  await declForm.locator('input[name="solde"]').fill('50000');
  for (const bad of ['1e4', '12 500', '0x10']) {
    await clearFeedback(page);
    await declForm.locator('input[name="capital"]').fill(bad);
    await declare.click();
    await expect(feedback, `opening capital ${JSON.stringify(bad)} is refused`).toHaveText(INCOMPLETE);
  }
  expect((await ledger<LedgerFund>(request, '/fund')).declarationCount).toBe(0);

  await declForm.locator('input[name="capital"]').fill('50000');
  await declare.click();
  await expect(page.locator('.fd-field--balance .fd-value')).toHaveText(fcfa(50_000));
  const fund = await ledger<LedgerFund>(request, '/fund');
  expect(fund.declarationCount).toBe(1);
  expect(fund.declaration?.balanceFcfa).toBe(50_000);

  // The tree survived every tap.
  await expect(page.locator('.desk-title')).toHaveText('Fonds de protection');
  expect(pageErrors).toEqual([]);
});

test('a seller-fault claim says it does not refund the buyer, and where her refund is checked', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto('/#/fonds-de-protection');
  await page.locator('input[name="cle"]').fill(WALK_KEY);
  await page.getByRole('button', { name: 'Ouvrir le registre' }).click();
  // order-walk-001 is the seller-fault claim the first walk opened.
  const row = page.locator('li.fd-claim[data-order="order-walk-001"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.fd-claim-refund')).toHaveText(
    'Cette réclamation ne rembourse pas la cliente — vérifier son remboursement dans Commandes, sur la console Boutik+.',
  );
  await expect(page.getByText('Cliente à rembourser en premier')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

test('the desk shows every open claim, the latest closed ones and « see older »', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  // Seed the book through the service itself: 25 closed claims, then 2 open.
  const service = (method: 'POST' | 'PUT', path: string, data: unknown) =>
    request.fetch(`${SERVICE}${path}`, { method, headers: { Authorization: `Bearer ${WALK_KEY}` }, data });
  for (let i = 0; i < 25; i += 1) {
    const orderId = `order-page-${String(i).padStart(2, '0')}`;
    expect(
      (await service('POST', '/claims', { orderId, reason: 'colis jamais pret', faultClass: 'buyer', amountFcfa: 2_000, evidenceBundleId: `evb-${orderId}` })).status(),
    ).toBe(201);
    expect(
      (await service('POST', `/claims/${orderId}/advance`, { to: 'closed_no_payout', closedReason: 'la cliente a renonce' })).status(),
    ).toBe(200);
  }
  for (const orderId of ['order-page-open-1', 'order-page-open-2']) {
    expect(
      (await service('POST', '/claims', { orderId, reason: 'mauvaise taille', faultClass: 'seller', amountFcfa: 9_000, evidenceBundleId: `evb-${orderId}` })).status(),
    ).toBe(201);
  }
  const ledgerAll = (await ledger<LedgerClaims>(request, '/claims')).claims;
  const openInBook = ledgerAll.filter((c) => c.claim.state === 'opened' || c.claim.state === 'under_review');

  await page.goto('/#/fonds-de-protection');
  await page.locator('input[name="cle"]').fill(WALK_KEY);
  await page.getByRole('button', { name: 'Ouvrir le registre' }).click();

  // Every open claim is on the first view — never behind a page.
  for (const c of openInBook) {
    await expect(page.locator(`li.fd-claim[data-order="${c.claim.orderId}"]`)).toBeVisible();
  }
  // The 20 most recently closed are shown, the 5 oldest wait behind « see older ».
  const closedRows = page.locator('li.fd-claim[data-state="closed_no_payout"]');
  await expect(closedRows).toHaveCount(20);
  await expect(page.locator('li.fd-claim[data-order="order-page-24"]')).toBeVisible();
  await expect(page.locator('li.fd-claim[data-order="order-page-04"]')).toHaveCount(0);

  const older = page.getByRole('button', { name: 'Voir les réclamations plus anciennes' });
  await older.click();
  await expect(closedRows).toHaveCount(25);
  await expect(page.locator('li.fd-claim[data-order="order-page-00"]')).toBeVisible();
  await expect(older).toHaveCount(0);
  // Open claims are still there, and still movable.
  await expect(
    page.locator('li.fd-claim[data-order="order-page-open-1"]').getByRole('button', { name: 'Passer en examen' }),
  ).toBeVisible();


  await expect(page.locator('.desk-title')).toHaveText('Fonds de protection');
  expect(pageErrors).toEqual([]);
});
