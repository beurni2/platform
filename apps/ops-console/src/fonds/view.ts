/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * Desk 1 view (FONDS-2) — the Protection Fund, rendered per canon §9.2:
 * « Solvency state, capitalization, and claims by faultClass. The law that
 * must never bend (B+I-13): buyer refunds are NEVER gated on the fund's
 * solvency. » The law line renders FIRST, always — before any figure, so no
 * solvency state can ever read as a condition on a buyer's refund.
 *
 * Honest states: an undeclared balance renders « non renseigné », never zero;
 * WATCH/RESTRICTED never render (the sizing decision is ⏳ open — the wire
 * cannot produce them). All strings from the catalog; classes only (fd-*
 * classes live in main.ts, token-driven).
 */

import { money } from '@platform/ui-tokens';
import { t } from '../i18n';
import type { FondsClaimRow, FondsData } from './port';

/** Canon money format: group separator + suffix from tokens (breakglass parity). */
function formatFcfa(amount: number): string {
  const negative = amount < 0;
  const digits = String(Math.abs(amount));
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += money.groupSeparator;
    grouped += digits[i];
  }
  return (negative ? '−' : '') + grouped + money.currencySuffix;
}

const FAULT_KEY: Record<string, string> = {
  seller: 'fonds.fault_seller',
  buyer: 'fonds.fault_buyer',
  payment_provider: 'fonds.fault_provider',
  platform_system: 'fonds.fault_platform',
  unresolved: 'fonds.fault_unresolved',
};

const STATE_KEY: Record<FondsClaimRow['state'], string> = {
  opened: 'fonds.state_opened',
  under_review: 'fonds.state_under_review',
  resolved: 'fonds.state_resolved',
};

const SOLVENCY_KEY: Record<string, string> = {
  HEALTHY: 'fonds.solvency_healthy',
  CRITICAL: 'fonds.solvency_critical',
};

function fundField(labelKey: string, value: string, extraClass?: string): HTMLElement {
  const field = document.createElement('div');
  field.className = extraClass === undefined ? 'fd-field' : `fd-field ${extraClass}`;
  const label = document.createElement('span');
  label.className = 'fd-label';
  label.textContent = t(labelKey);
  const val = document.createElement('span');
  val.className = 'fd-value';
  val.textContent = value;
  field.append(label, val);
  return field;
}

function claimRow(row: FondsClaimRow): HTMLElement {
  const li = document.createElement('li');
  li.className = 'fd-claim';
  li.dataset['state'] = row.state;
  li.dataset['order'] = row.orderId;

  const head = document.createElement('div');
  head.className = 'fd-claim-head';
  const ref = document.createElement('span');
  ref.className = 'fd-claim-ref';
  ref.textContent = row.orderId;
  const amount = document.createElement('span');
  amount.className = 'fd-claim-amount';
  amount.textContent = formatFcfa(row.amountFcfa);
  const state = document.createElement('span');
  state.className = `fd-state fd-state--${row.state}`;
  state.textContent = t(STATE_KEY[row.state]);
  head.append(ref, amount, state);

  const reason = document.createElement('p');
  reason.className = 'fd-claim-reason';
  reason.textContent = row.reason;

  const proof = document.createElement('p');
  proof.className = 'fd-claim-proof';
  proof.textContent = `${t('fonds.evidence_label')} ${row.evidenceBundleId}`;

  li.append(head, reason, proof);

  if (row.settlementRef !== undefined) {
    const settled = document.createElement('p');
    settled.className = 'fd-claim-settled';
    settled.textContent = `${t('fonds.settlement_label')} ${row.settlementRef}`;
    li.append(settled);
  }
  if (row.refundRequired) {
    const refund = document.createElement('p');
    refund.className = 'fd-claim-refund';
    refund.textContent = t('fonds.refund_required');
    li.append(refund);
  }
  return li;
}

export function renderFondsView(host: HTMLElement, data: FondsData, sandboxLabel: string | null): void {
  host.replaceChildren();

  if (sandboxLabel !== null) {
    const ribbon = document.createElement('p');
    ribbon.className = 'mod-ribbon';
    ribbon.textContent = sandboxLabel;
    host.append(ribbon);
  }

  // B+I-13 FIRST — before any figure, always.
  const law = document.createElement('p');
  law.className = 'fd-law';
  law.textContent = t('fonds.law_buyer_first');
  host.append(law);

  const fund = document.createElement('section');
  fund.className = 'fd-fund';
  const f = data.fund;
  fund.append(
    fundField(
      'fonds.balance',
      f.balanceFcfa === null ? t('fonds.not_declared') : formatFcfa(f.balanceFcfa),
      'fd-field--balance',
    ),
    fundField('fonds.committed', formatFcfa(f.committedClaimsAmountFcfa)),
    fundField(
      'fonds.available',
      f.availableAfterCommitmentsFcfa === null
        ? t('fonds.not_declared')
        : formatFcfa(f.availableAfterCommitmentsFcfa),
    ),
  );
  const solvency = document.createElement('p');
  const state = f.solvencyState;
  if (state === null || SOLVENCY_KEY[state] === undefined) {
    solvency.className = 'fd-solvency fd-solvency--unknown';
    solvency.textContent = t('fonds.solvency_unknown');
  } else {
    solvency.className = `fd-solvency fd-solvency--${state.toLowerCase()}`;
    solvency.textContent = t(SOLVENCY_KEY[state] as string);
  }
  fund.append(solvency);
  if (f.declaredAt !== null) {
    const declared = document.createElement('p');
    declared.className = 'fd-declared';
    declared.textContent = `${t('fonds.declared_label')} ${f.declaredAt.slice(0, 10)}`;
    fund.append(declared);
  }
  host.append(fund);

  // Claims BY faultClass — the canon grouping (Desk 1), groups in canon order.
  const groups = new Map<string, FondsClaimRow[]>();
  for (const row of data.claims) {
    const list = groups.get(row.faultClass) ?? [];
    list.push(row);
    groups.set(row.faultClass, list);
  }
  if (data.claims.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'fd-empty';
    empty.textContent = t('fonds.no_claims');
    host.append(empty);
    return;
  }
  for (const [fault, key] of Object.entries(FAULT_KEY)) {
    const rows = groups.get(fault);
    if (rows === undefined) continue;
    const section = document.createElement('section');
    section.className = 'fd-group';
    section.dataset['fault'] = fault;
    const title = document.createElement('h3');
    title.className = 'fd-group-title';
    title.textContent = t(key);
    const list = document.createElement('ul');
    list.className = 'fd-claims';
    for (const row of rows) list.append(claimRow(row));
    section.append(title, list);
    host.append(section);
  }
}
