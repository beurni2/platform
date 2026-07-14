import {
  sharedColour as C,
  spacing,
  radius,
  type as typo,
  interaction,
  band,
  touch,
  ribbon,
} from '@platform/ui-tokens';
import { DESKS, type Desk } from './desks';
import { opsIcon } from './icons';
import { t } from './i18n';
import { buildSandboxQueue } from './moderation/sandbox';
import { renderModerationQueue } from './moderation/queue-view';
import { buildSandboxBreakGlass } from './breakglass/sandbox';
import { renderBreakGlassBoard } from './breakglass/board-view';
import { buildSandboxRefusalLadder, SANDBOX_NOW } from './refusal/sandbox';
import { deriveRefusalLadder } from './refusal/ladder';
import { renderRefusalLadder } from './refusal/ladder-view';

/**
 * WO-OPS-0 / WO-OPS-1a — the platform ops console SHELL. The eight desks (canon
 * ECOSYSTEM-MASTER-REFERENCE §9.2) as hash ROUTES. Seven remain honest empty
 * shells; DESK 3 (moderation) is now LIVE — it renders the moderation queue
 * (pending / decided, reasons verbatim) from the real command path. Everything is
 * Grand Teint: colours, spacing, type, radius, hairlines come from
 * @platform/ui-tokens — no local values (the zero-hardcode scan enforces it).
 * There is no `platform`/ops theme in ui-tokens (only boutik-plus/shop-plus/
 * sera); the console is the shared/neutral palette — ink on warm paper.
 */

const px = (n: number): string => `${n}px`;
const lh = (s: { size: number; lh: number }): number => s.size * s.lh;

const root = document.documentElement;
// colours (shared/neutral palette — no app accent)
root.style.setProperty('--paper', C.paper);
root.style.setProperty('--sand', C.sand);
root.style.setProperty('--ink', C.ink);
root.style.setProperty('--on-ink', C.onInk);
root.style.setProperty('--body', C.body);
root.style.setProperty('--muted', C.muted);
root.style.setProperty('--soft', C.soft);
root.style.setProperty('--desk', C.desk);
root.style.setProperty('--surface-muted', C.surfaceMuted);
root.style.setProperty('--hairline', C.hairline);
root.style.setProperty('--hairline-strong', C.hairlineStrong);
root.style.setProperty('--success', C.success);
root.style.setProperty('--success-tint', C.successTint);
root.style.setProperty('--warning', C.warning);
root.style.setProperty('--warning-tint', C.warningTint);
// lengths (all token-derived — no literals)
root.style.setProperty('--space-xs', px(spacing.xs));
root.style.setProperty('--space-sm', px(spacing.sm));
root.style.setProperty('--space-md', px(spacing.md));
root.style.setProperty('--space-lg', px(spacing.lg));
root.style.setProperty('--space-xl', px(spacing.xl));
root.style.setProperty('--space-xxl', px(spacing.xxl));
root.style.setProperty('--strip', px(band.themeStripPx));
root.style.setProperty('--touch', px(touch.minTargetPx));
root.style.setProperty('--hair', px(interaction.hairline.thin));
root.style.setProperty('--hair-strong', px(interaction.hairline.strong));
root.style.setProperty('--radius-btn', px(radius.button));
// icon box: the glyphs are viewBox 0..24 — size the box from the xl spacing step
root.style.setProperty('--icon', px(spacing.xl));
// type
root.style.setProperty('--type-title', px(typo.scale.title.size));
root.style.setProperty('--type-row', px(typo.scale.row.size));
root.style.setProperty('--type-body', px(typo.scale.body.size));
root.style.setProperty('--type-label', px(typo.scale.label.size));
root.style.setProperty('--type-label-lh', px(lh(typo.scale.label)));
root.style.setProperty('--type-caption', px(typo.scale.caption.size));
root.style.setProperty('--ls-label', px(typo.scale.label.ls));

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--sand);
    color: var(--ink);
    font-family: 'Archivo', system-ui, sans-serif;
  }
  #app {
    min-height: 100vh;
    background: var(--paper);
    border-left: var(--hair) solid var(--hairline);
    border-right: var(--hair) solid var(--hairline);
  }
  .strip { height: var(--strip); background: var(--ink); }
  header {
    padding: var(--space-lg) var(--space-xl);
    border-bottom: var(--hair) solid var(--hairline);
  }
  h1 {
    margin: 0;
    color: var(--ink);
    font-size: var(--type-title);
    font-weight: ${typo.scale.title.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .principle {
    margin: var(--space-xs) 0 0 0;
    color: var(--muted);
    font-size: var(--type-caption);
    font-weight: ${typo.scale.caption.wght};
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    padding: var(--space-md) var(--space-xl);
    border-bottom: var(--hair) solid var(--hairline);
  }
  .desk-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    min-height: var(--touch);
    padding: var(--space-sm) var(--space-md);
    background: var(--surface-muted);
    color: var(--body);
    border: var(--hair) solid var(--hairline);
    border-radius: var(--radius-btn);
    font-family: inherit;
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
    cursor: pointer;
  }
  .desk-link[aria-current="page"] {
    background: var(--desk);
    color: var(--ink);
    border-color: var(--ink);
    border-width: var(--hair-strong);
  }
  .desk-link .glyph { display: inline-flex; color: currentColor; }
  .desk-link .glyph svg { width: var(--icon); height: var(--icon); display: block; }
  main { padding: var(--space-xl); }
  .desk-panel { display: grid; gap: var(--space-md); }
  .desk-title {
    margin: 0;
    color: var(--ink);
    font-size: var(--type-title);
    font-weight: ${typo.scale.title.wght};
  }
  .empty-state {
    margin: 0;
    color: var(--muted);
    font-size: var(--type-body);
    font-weight: ${typo.scale.body.wght};
    line-height: ${typo.scale.body.lh};
  }
  .desk-content { display: grid; gap: var(--space-md); }
  .mod-ribbon {
    margin: 0;
    align-self: start;
    padding: var(--space-xs) var(--space-sm);
    background: var(--warning-tint);
    color: var(--warning);
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .mod-note {
    margin: 0;
    color: var(--muted);
    font-size: var(--type-caption);
    font-weight: ${typo.scale.caption.wght};
  }
  .mod-queue { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-sm); }
  .mod-item {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-sm);
    align-items: baseline;
    padding: var(--space-md);
    background: var(--surface-muted);
    border: var(--hair) solid var(--hairline);
    border-radius: var(--radius-btn);
  }
  .mod-ref {
    color: var(--body);
    font-size: var(--type-row);
    font-weight: ${typo.scale.row.wght};
  }
  .mod-state {
    justify-self: end;
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .mod-state--pending { color: var(--muted); }
  .mod-state--approved { color: var(--success); }
  .mod-state--changes_requested { color: var(--warning); }
  .mod-reasons {
    grid-column: 1 / -1;
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .mod-reason {
    padding: var(--space-xs) var(--space-sm);
    background: var(--warning-tint);
    color: var(--warning);
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .bg-case {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--surface-muted);
    border: var(--hair) solid var(--hairline);
    border-radius: var(--radius-btn);
  }
  .bg-field { display: flex; flex-direction: column; gap: var(--space-xs); }
  .bg-amount { grid-column: 1 / -1; }
  .bg-label {
    color: var(--muted);
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .bg-value {
    color: var(--ink);
    font-size: var(--type-row);
    font-weight: ${typo.scale.row.wght};
  }
  .bg-amount .bg-value { font-size: var(--type-title); font-weight: ${typo.scale.title.wght}; }
  .bg-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-xs); }
  .bg-step {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: var(--space-sm) var(--space-md);
    border: var(--hair) solid var(--hairline);
    border-radius: var(--radius-btn);
  }
  .bg-step-name {
    color: var(--body);
    font-size: var(--type-row);
    font-weight: ${typo.scale.row.wght};
  }
  .bg-step-status {
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .bg-step-status--done { color: var(--success); }
  .bg-step-status--current { color: var(--ink); }
  .bg-step-status--pending { color: var(--muted); }
  .rf-legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }
  .rf-legend-rung {
    padding: var(--space-xs) var(--space-sm);
    background: var(--surface-muted);
    color: var(--muted);
    border: var(--hair) solid var(--hairline);
    border-radius: var(--radius-btn);
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .rf-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-sm); }
  .rf-row {
    display: grid;
    gap: var(--space-sm);
    padding: var(--space-md);
    background: var(--surface-muted);
    border: var(--hair) solid var(--hairline);
    border-radius: var(--radius-btn);
  }
  .rf-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-sm);
  }
  .rf-buyer { flex: 1 1 auto; }
  .rf-field { display: flex; flex-direction: column; gap: var(--space-xs); }
  .rf-label {
    color: var(--muted);
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .rf-value {
    color: var(--ink);
    font-size: var(--type-row);
    font-weight: ${typo.scale.row.wght};
  }
  .rf-rung, .rf-elig {
    align-self: center;
    padding: var(--space-xs) var(--space-sm);
    border-radius: var(--radius-btn);
    font-size: var(--type-label);
    font-weight: ${typo.scale.label.wght};
    letter-spacing: var(--ls-label);
    text-transform: uppercase;
  }
  .rf-rung { background: var(--surface-muted); color: var(--body); border: var(--hair) solid var(--hairline); }
  .rf-rung--good_standing { color: var(--success); }
  .rf-rung--suspended { color: var(--warning); }
  .rf-elig--allowed { background: var(--success-tint); color: var(--success); }
  .rf-elig--restricted { background: var(--warning-tint); color: var(--warning); }
  .rf-facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm) var(--space-lg);
  }
`;
document.head.appendChild(style);

const app = document.querySelector<HTMLDivElement>('#app');
if (app === null) throw new Error('missing #app root');

// ── shell chrome (rendered once) ─────────────────────────────────────────────
const strip = document.createElement('div');
strip.className = 'strip';

const header = document.createElement('header');
const h1 = document.createElement('h1');
h1.textContent = t('app.title');
const principle = document.createElement('p');
principle.className = 'principle';
principle.textContent = t('app.principle');
header.append(h1, principle);

const nav = document.createElement('nav');
nav.setAttribute('aria-label', t('app.title'));
const navButtons = new Map<string, HTMLButtonElement>();
for (const desk of DESKS) {
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'desk-link';
  link.dataset['id'] = desk.id;
  const glyph = document.createElement('span');
  glyph.className = 'glyph';
  glyph.innerHTML = opsIcon[desk.glyph]; // trusted, byte-verified canon SVG (icons.test.ts)
  const word = document.createElement('span');
  word.className = 'word';
  word.textContent = t(desk.titleKey);
  link.append(glyph, word);
  link.addEventListener('click', () => {
    window.location.hash = `#/${desk.id}`;
  });
  navButtons.set(desk.id, link);
  nav.append(link);
}

const main = document.createElement('main');
const panel = document.createElement('section');
panel.className = 'desk-panel';
const deskTitle = document.createElement('h2');
deskTitle.className = 'desk-title';
const contentHost = document.createElement('div');
contentHost.className = 'desk-content';
panel.append(deskTitle, contentHost);
main.append(panel);

app.append(strip, header, nav, main);

// ── router: eight desks as hash routes ────────────────────────────────────────
// Desks 3 (moderation), 5 (reconciliation-operateur) and 6 (echelle-de-refus)
// render live surfaces; the other five stay honest shells.
function currentDesk(): Desk {
  const slug = window.location.hash.replace(/^#\/?/, '');
  return DESKS.find((d) => d.id === slug) ?? DESKS[0]!;
}

function renderEmptyShell(): void {
  contentHost.replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'empty-state';
  empty.textContent = t('desk.empty_state');
  contentHost.append(empty);
}

function render(): void {
  const desk = currentDesk();
  deskTitle.textContent = t(desk.titleKey);
  if (desk.id === 'moderation') {
    renderModerationQueue(
      contentHost,
      buildSandboxQueue(new Date().toISOString()),
      ribbon.sandbox.label,
    );
  } else if (desk.id === 'reconciliation-operateur') {
    // Desk 5 — the payment operator's break-glass issuing surface (WO-OPS-1b).
    renderBreakGlassBoard(contentHost, buildSandboxBreakGlass(new Date().toISOString()));
  } else if (desk.id === 'echelle-de-refus') {
    // Desk 6 — refusal-ladder oversight (read-only; no lever). Fixed clock so
    // the preview is deterministic (WO-OPS-DESK-6).
    renderRefusalLadder(
      contentHost,
      deriveRefusalLadder(buildSandboxRefusalLadder(), SANDBOX_NOW),
    );
  } else {
    renderEmptyShell();
  }
  for (const [id, link] of navButtons) {
    if (id === desk.id) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', render);
render();
