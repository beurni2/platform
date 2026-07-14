import { money } from '@platform/ui-tokens';
import { t } from '../i18n';
import type { LadderRung, RefusalLadderBoard, RefusalLadderRow } from './ladder';

/**
 * Desk 6 refusal-ladder view (WO-OPS-DESK-6). RENDER-ONLY: it reads a
 * `RefusalLadderBoard` and appends DOM — it never writes back, holds no lever,
 * issues no command. Every DATA field (buyerRef, state, riskState, reason,
 * refusalCount, deposit) is rendered VERBATIM; only the rung/eligibility badges
 * are the board's derived presentation. Class-only styling (token-driven classes
 * live in main.ts) → no literals here. French Voice, trust register: a ladder
 * state is a consequence, never blame.
 */
const RUNG_KEY: Record<LadderRung, string> = {
  good_standing: 'refusal.rung_good_standing',
  deposit_required: 'refusal.rung_deposit_required',
  prepay_only: 'refusal.rung_prepay_only',
  suspended: 'refusal.rung_suspended',
};

/**
 * The 12 month names live in the catalog (register-tagged, never inline). A date
 * is DATA (custody of truth stays the raw ISO in the read model); the view only
 * PRESENTS it in human French — deterministically, from the UTC parts, so the
 * fixed-clock preview is byte-stable (no locale/ICU dependency).
 */
const MONTH_KEYS = [
  'date.month_01',
  'date.month_02',
  'date.month_03',
  'date.month_04',
  'date.month_05',
  'date.month_06',
  'date.month_07',
  'date.month_08',
  'date.month_09',
  'date.month_10',
  'date.month_11',
  'date.month_12',
] as const;

/** Human French date « 21 juillet 2026 » from an ISO timestamp (UTC parts). */
function formatFrenchDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${t(MONTH_KEYS[d.getUTCMonth()]!)} ${d.getUTCFullYear()}`;
}

/** Canon money format: narrow-space group separator + « F » suffix (tokens). */
function formatFcfa(amount: number): string {
  const digits = String(amount);
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += money.groupSeparator;
    grouped += digits[i];
  }
  return grouped + money.currencySuffix;
}

function field(labelKey: string, value: string, cls: string): HTMLElement {
  const row = document.createElement('div');
  row.className = `rf-field ${cls}`;
  const label = document.createElement('span');
  label.className = 'rf-label';
  label.textContent = t(labelKey);
  const val = document.createElement('span');
  val.className = 'rf-value';
  val.textContent = value; // DATA — verbatim, never translated
  row.append(label, val);
  return row;
}

function badge(text: string, cls: string): HTMLElement {
  const span = document.createElement('span');
  span.className = cls;
  span.textContent = text;
  return span;
}

function rowEl(row: RefusalLadderRow): HTMLElement {
  const li = document.createElement('li');
  li.className = 'rf-row';
  li.dataset['rung'] = row.rung;
  li.dataset['eligibility'] = row.eligibility;

  const head = document.createElement('div');
  head.className = 'rf-head';
  head.append(
    field('refusal.buyer', row.buyerRef, 'rf-buyer'),
    badge(t(RUNG_KEY[row.rung]), `rf-rung rf-rung--${row.rung}`),
    badge(
      t(row.eligibility === 'allowed' ? 'refusal.eligibility_allowed' : 'refusal.eligibility_restricted'),
      `rf-elig rf-elig--${row.eligibility}`,
    ),
  );

  const facts = document.createElement('div');
  facts.className = 'rf-facts';
  facts.append(
    field('refusal.refusals', String(row.refusalCount), 'rf-refusals'),
    field('refusal.risk', row.riskState, 'rf-risk'),
  );
  if (row.reason !== undefined) {
    facts.append(field('refusal.reason', row.reason, 'rf-reason'));
  }
  if (row.requiredDeposit > 0) {
    facts.append(field('refusal.deposit', formatFcfa(row.requiredDeposit), 'rf-deposit'));
  }
  if (row.prepayOnlyUntil !== undefined) {
    facts.append(field('refusal.prepay_until', formatFrenchDate(row.prepayOnlyUntil), 'rf-prepay'));
  }

  li.append(head, facts);
  return li;
}

export function renderRefusalLadder(host: HTMLElement, board: RefusalLadderBoard): void {
  host.replaceChildren();

  const ribbon = document.createElement('p');
  ribbon.className = 'mod-ribbon';
  ribbon.textContent = t('refusal.sandbox_note');

  // "trend at a glance": the rungs in canon order, best → most restricted.
  const legend = document.createElement('ol');
  legend.className = 'rf-legend';
  for (const rung of board.rungs) {
    const li = document.createElement('li');
    li.className = `rf-legend-rung rf-rung--${rung}`;
    li.textContent = t(RUNG_KEY[rung]);
    legend.append(li);
  }

  const list = document.createElement('ul');
  list.className = 'rf-list';
  for (const row of board.rows) list.append(rowEl(row));

  host.append(ribbon, legend, list);
}
