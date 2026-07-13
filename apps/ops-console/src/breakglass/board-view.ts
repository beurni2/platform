import { money } from '@platform/ui-tokens';
import type { HandoffAuthorizationState } from '@platform/contracts';
import { t } from '../i18n';
import type { BreakGlassCaseBoard, BreakGlassStep } from './board';

/**
 * Desk 5 break-glass view (WO-OPS-1b). Renders the case honestly: the case id,
 * both operators named (maker-checker), the operator-verified `exactAmount`
 * (canon money format — narrow-space group + « F »; it never leaves), and the
 * state machine with `provider_confirmed`/`issued`/`consumed` shown « en
 * attente ». Renders NO signature — the fourth secret is not in the data.
 * Class-only styling (token-driven classes live in main.ts) → no literals here.
 */
const STEP_KEY: Record<HandoffAuthorizationState, string> = {
  requested: 'breakglass.state_requested',
  operator_verifying: 'breakglass.state_verifying',
  provider_confirmed: 'breakglass.state_provider',
  issued: 'breakglass.state_issued',
  consumed: 'breakglass.state_consumed',
  expired: 'breakglass.state_expired',
  voided: 'breakglass.state_voided',
};

const STATUS_KEY: Record<BreakGlassStep['status'], string> = {
  done: 'breakglass.status_done',
  current: 'breakglass.status_current',
  pending: 'breakglass.status_pending', // « en attente »
};

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
  row.className = `bg-field ${cls}`;
  const label = document.createElement('span');
  label.className = 'bg-label';
  label.textContent = t(labelKey);
  const val = document.createElement('span');
  val.className = 'bg-value';
  val.textContent = value;
  row.append(label, val);
  return row;
}

export function renderBreakGlassBoard(host: HTMLElement, board: BreakGlassCaseBoard): void {
  host.replaceChildren();

  const ribbon = document.createElement('p');
  ribbon.className = 'mod-ribbon';
  ribbon.textContent = t('breakglass.sandbox_note');

  const grid = document.createElement('div');
  grid.className = 'bg-case';
  grid.append(
    field('breakglass.case', board.caseId, 'bg-case-id'),
    field('breakglass.order', board.orderId, 'bg-order'),
    field('breakglass.rider', board.riderId, 'bg-rider'),
    field('breakglass.amount', formatFcfa(board.exactAmount), 'bg-amount'),
    field('breakglass.requested_by', board.requestedBy, 'bg-requested-by'),
    field('breakglass.approved_by', board.approvedBy, 'bg-approved-by'),
  );

  const steps = document.createElement('ol');
  steps.className = 'bg-steps';
  for (const step of board.steps) {
    const li = document.createElement('li');
    li.className = 'bg-step';
    li.dataset['status'] = step.status;
    const name = document.createElement('span');
    name.className = 'bg-step-name';
    name.textContent = t(STEP_KEY[step.state]);
    const status = document.createElement('span');
    status.className = `bg-step-status bg-step-status--${step.status}`;
    status.textContent = t(STATUS_KEY[step.status]);
    li.append(name, status);
    steps.append(li);
  }

  host.append(ribbon, grid, steps);
}
