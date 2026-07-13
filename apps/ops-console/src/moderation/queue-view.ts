import { t } from '../i18n';
import type { QueueItem } from './sandbox';

/**
 * Desk 3 queue view (WO-OPS-1a). Renders the moderation queue honestly:
 * pending / approved / changes_requested, with each changes_requested row naming
 * its reasons VERBATIM (every cited reason, none summarised). All strings come
 * from the catalog (`t`) or a passed token; styling is class-only (token-driven
 * classes live in main.ts) so this module holds no colour/length literals.
 */
const STATE_KEY: Record<QueueItem['state'], string> = {
  pending: 'moderation.state_pending',
  approved: 'moderation.state_approved',
  changes_requested: 'moderation.state_changes',
};

export function renderModerationQueue(
  host: HTMLElement,
  items: readonly QueueItem[],
  sandboxLabel: string,
): void {
  host.replaceChildren();

  const ribbon = document.createElement('p');
  ribbon.className = 'mod-ribbon';
  ribbon.textContent = sandboxLabel;

  const note = document.createElement('p');
  note.className = 'mod-note';
  note.textContent = t('moderation.two_operator_note');

  const list = document.createElement('ul');
  list.className = 'mod-queue';
  for (const item of items) {
    const row = document.createElement('li');
    row.className = 'mod-item';
    row.dataset['state'] = item.state;

    const ref = document.createElement('span');
    ref.className = 'mod-ref';
    ref.textContent = item.listingRef;

    const state = document.createElement('span');
    state.className = `mod-state mod-state--${item.state}`;
    state.textContent = t(STATE_KEY[item.state]);

    row.append(ref, state);

    if (item.reasons.length > 0) {
      const reasons = document.createElement('ul');
      reasons.className = 'mod-reasons';
      for (const code of item.reasons) {
        const reason = document.createElement('li');
        reason.className = 'mod-reason';
        reason.textContent = t(`moderation.reason.${code}`);
        reasons.append(reason);
      }
      row.append(reasons);
    }
    list.append(row);
  }

  host.append(ribbon, note, list);
}
