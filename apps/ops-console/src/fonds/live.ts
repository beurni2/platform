/*
 * OPS NE MODIFIE JAMAIS LE REGISTRE. Aucun humain ne « corrige » l'argent.
 * Chaque action est une commande permissionnée, événementielle et auditée.
 */

/**
 * Desk 1 live surface (FONDS-2) — the key door, then the book with the three
 * RECORDING actions (founder ruling 2026-08-06: the money moves offline; the
 * software records):
 *   · ouvrir une réclamation (fault, amount, evidence — Séra fault excluded
 *     BY DESIGN: Desk 2 routes it to the custody instrument, not the fund);
 *   · avancer l'état (opened → under_review → resolved, resolved only with
 *     the offline payment's reference);
 *   · déclarer le solde (the dated figure, appended to history).
 *
 * The key lives in a module variable for the session — never in the bundle,
 * never in storage. A 401 clears it and re-renders the door.
 */

import type { FaultClass } from '@platform/contracts';
import { t } from '../i18n';
import { HttpFondsPort } from './http';
import type { FondsPort } from './port';
import { renderFondsView } from './view';

let sessionKey: string | null = null;

const OPEN_FAULTS: ReadonlyArray<{ value: FaultClass; key: string }> = [
  { value: 'seller', key: 'fonds.fault_seller' },
  { value: 'buyer', key: 'fonds.fault_buyer' },
  { value: 'payment_provider', key: 'fonds.fault_provider' },
  { value: 'platform_system', key: 'fonds.fault_platform' },
  { value: 'unresolved', key: 'fonds.fault_unresolved' },
];

function textInput(name: string, labelKey: string, type = 'text'): { field: HTMLElement; input: HTMLInputElement } {
  const field = document.createElement('label');
  field.className = 'fd-form-field';
  const caption = document.createElement('span');
  caption.className = 'fd-label';
  caption.textContent = t(labelKey);
  const input = document.createElement('input');
  input.className = 'fd-input';
  input.name = name;
  input.type = type;
  field.append(caption, input);
  return { field, input };
}

function button(labelKey: string, kind: 'primary' | 'quiet'): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'submit';
  b.className = kind === 'primary' ? 'fd-btn' : 'fd-btn fd-btn--quiet';
  b.textContent = t(labelKey);
  return b;
}

function note(host: HTMLElement, key: string, isError: boolean): void {
  const p = document.createElement('p');
  p.className = isError ? 'fd-note fd-note--error' : 'fd-note';
  p.textContent = t(key);
  host.append(p);
}

/** Service refusal codes → catalog keys; unknown codes render the generic line. */
const ERROR_KEY: Record<string, string> = {
  unauthorized: 'fonds.error_unauthorized',
  duplicate: 'fonds.error_duplicate',
  not_forward: 'fonds.error_not_forward',
  settlement_ref_required: 'fonds.error_settlement_ref',
  not_a_fund_claim: 'fonds.error_sera_routing',
  unreachable: 'fonds.error_unreachable',
};

export function renderFondsLive(host: HTMLElement, base: string): void {
  if (sessionKey === null) {
    renderKeyDoor(host, base);
    return;
  }
  void renderBook(host, new HttpFondsPort(base, sessionKey), base);
}

function renderKeyDoor(host: HTMLElement, base: string): void {
  host.replaceChildren();
  const form = document.createElement('form');
  form.className = 'fd-door';
  const { field, input } = textInput('cle', 'fonds.door_label', 'password');
  const open = button('fonds.door_open', 'primary');
  form.append(field, open);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value.length === 0) return;
    sessionKey = value;
    renderFondsLive(host, base);
  });
  host.append(form);
}

async function renderBook(host: HTMLElement, port: FondsPort, base: string): Promise<void> {
  host.replaceChildren();
  const loading = document.createElement('p');
  loading.className = 'fd-note';
  loading.textContent = t('fonds.loading');
  host.append(loading);

  let data;
  try {
    data = await port.load();
  } catch (err) {
    if (err instanceof Error && err.message === 'unauthorized') {
      sessionKey = null; // the door again — a wrong key never half-opens
      renderKeyDoor(host, base);
      note(host, 'fonds.error_unauthorized', true);
    } else {
      host.replaceChildren();
      note(host, 'fonds.error_unreachable', true);
    }
    return;
  }

  renderFondsView(host, data, null);

  const refresh = () => void renderBook(host, port, base);
  const feedback = document.createElement('div');
  feedback.className = 'fd-feedback';
  host.append(feedback);

  const act = async (result: Promise<{ ok: boolean; error?: string }>): Promise<void> => {
    feedback.replaceChildren();
    const outcome = await result;
    if (outcome.ok) {
      refresh();
      return;
    }
    if (outcome.error === 'unauthorized') sessionKey = null;
    note(feedback, ERROR_KEY[outcome.error ?? ''] ?? 'fonds.error_unreachable', true);
  };

  // ── advance actions, per unresolved claim ────────────────────────────────
  for (const claim of data.claims) {
    const row = host.querySelector<HTMLElement>(`[data-order="${claim.orderId}"]`);
    if (row === null) continue;
    if (claim.state === 'opened') {
      const form = document.createElement('form');
      form.className = 'fd-advance';
      const go = button('fonds.action_review', 'quiet');
      form.append(go);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        void act(port.advance(claim.orderId, 'under_review'));
      });
      row.append(form);
    } else if (claim.state === 'under_review') {
      const form = document.createElement('form');
      form.className = 'fd-advance';
      const { field, input } = textInput('reglement', 'fonds.settlement_ref_label');
      const go = button('fonds.action_resolve', 'quiet');
      form.append(field, go);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const ref = input.value.trim();
        if (ref.length === 0) {
          feedback.replaceChildren();
          note(feedback, 'fonds.error_settlement_ref', true);
          return;
        }
        void act(port.advance(claim.orderId, 'resolved', ref));
      });
      row.append(form);
    }
  }

  // ── ouvrir une réclamation ───────────────────────────────────────────────
  const openSection = document.createElement('section');
  openSection.className = 'fd-form-card';
  const openTitle = document.createElement('h3');
  openTitle.className = 'fd-group-title';
  openTitle.textContent = t('fonds.open_title');
  const seraNote = document.createElement('p');
  seraNote.className = 'fd-note';
  seraNote.textContent = t('fonds.sera_routing_note');
  const openForm = document.createElement('form');
  openForm.className = 'fd-form';
  const order = textInput('commande', 'fonds.open_order');
  const reason = textInput('motif', 'fonds.open_reason');
  const amount = textInput('montant', 'fonds.open_amount', 'number');
  const evidence = textInput('preuve', 'fonds.open_evidence');
  const faultField = document.createElement('label');
  faultField.className = 'fd-form-field';
  const faultCaption = document.createElement('span');
  faultCaption.className = 'fd-label';
  faultCaption.textContent = t('fonds.open_fault');
  const faultSelect = document.createElement('select');
  faultSelect.className = 'fd-input';
  for (const { value, key } of OPEN_FAULTS) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = t(key);
    faultSelect.append(opt);
  }
  faultField.append(faultCaption, faultSelect);
  openForm.append(order.field, reason.field, amount.field, faultField, evidence.field, button('fonds.open_submit', 'primary'));
  openForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const amountFcfa = Number(amount.input.value);
    if (
      order.input.value.trim().length === 0 ||
      reason.input.value.trim().length === 0 ||
      evidence.input.value.trim().length === 0 ||
      !Number.isSafeInteger(amountFcfa) ||
      amountFcfa < 0
    ) {
      feedback.replaceChildren();
      note(feedback, 'fonds.error_form_incomplete', true);
      return;
    }
    void act(
      port.openClaim({
        orderId: order.input.value.trim(),
        reason: reason.input.value.trim(),
        faultClass: faultSelect.value as FaultClass,
        amountFcfa,
        evidenceBundleId: evidence.input.value.trim(),
      }),
    );
  });
  openSection.append(openTitle, seraNote, openForm);
  host.append(openSection);

  // ── déclarer le solde ────────────────────────────────────────────────────
  const declSection = document.createElement('section');
  declSection.className = 'fd-form-card';
  const declTitle = document.createElement('h3');
  declTitle.className = 'fd-group-title';
  declTitle.textContent = t('fonds.declare_title');
  const declForm = document.createElement('form');
  declForm.className = 'fd-form';
  const balance = textInput('solde', 'fonds.declare_balance', 'number');
  const opening = textInput('capital', 'fonds.declare_opening', 'number');
  declForm.append(balance.field, opening.field, button('fonds.declare_submit', 'primary'));
  declForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const balanceFcfa = Number(balance.input.value);
    if (!Number.isSafeInteger(balanceFcfa) || balanceFcfa < 0) {
      feedback.replaceChildren();
      note(feedback, 'fonds.error_form_incomplete', true);
      return;
    }
    const openingRaw = opening.input.value.trim();
    const openingFcfa = openingRaw.length === 0 ? undefined : Number(openingRaw);
    if (openingFcfa !== undefined && (!Number.isSafeInteger(openingFcfa) || openingFcfa < 0)) {
      feedback.replaceChildren();
      note(feedback, 'fonds.error_form_incomplete', true);
      return;
    }
    void act(port.declare(balanceFcfa, openingFcfa));
  });
  declSection.append(declTitle, declForm);
  host.append(declSection);
}
