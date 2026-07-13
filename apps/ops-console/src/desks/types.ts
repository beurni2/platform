import type { OpsIconName } from '../icons';

/**
 * A desk descriptor. WO-OPS-0 builds the desks as ROUTES with honest empty
 * states only — NO desk is wired to real data, NO command exists yet. The
 * descriptor names the route, its canon origin, its title string key, and its
 * nav glyph (the icon + word law — a glyph is never shown without its word).
 */
export interface Desk {
  /** route slug (hash route). */
  readonly id: string;
  /** canon origin — the desk this route stands for (ECOSYSTEM-MASTER-REFERENCE §9.2). */
  readonly canon: string;
  /** i18n key for the desk title (strings live in the catalog, never inline). */
  readonly titleKey: string;
  /** nav glyph from canon's 29-icon set (presentational aid; icon + word). */
  readonly glyph: OpsIconName;
}
