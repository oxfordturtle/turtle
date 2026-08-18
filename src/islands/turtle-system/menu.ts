/// <reference lib="dom" />
import { html, type HtmlResult } from "@merivale/womble";
import { showError } from "@/client/tools/error.ts";
import { classes } from "@/islands/lib.ts";
import { settingsStore } from "@/islands/settings.ts";
import { notImplemented } from "@/islands/setting-controls.ts";

// What the seven submenu components of the system menu share. Each owns one
// `.system-sub-menu` pair - the toggle link in the collapsed rail, and the panel
// that slides out beside it - and `<turtle-system>` writes their tags into the
// rail.
//
// **Which way each direction goes.** Down is props: the root interpolates
// `open="${submenu === "file"}"` and re-asserts it on every render, so "opening
// one closes its siblings" needs no cooperation between them. Up is the
// announce: a submenu's action returns `undefined`, Womble dispatches a bubbling
// event named after it, and the root picks it up with `on-<action>`. None of
// these components names `turtle-system` at all: they don't know who their call
// site is.

/** the store every submenu follows: the settings the whole site shares */
export const menuSources = [settingsStore];

/**
 * The chrome all seven submenus share: the toggle link in the collapsed rail,
 * and the panel that slides out beside it. `hidden` is for a whole submenu that
 * only some modes have (Compile).
 */
export const submenu = (
  {
    icon,
    label,
    open,
    hidden,
  }: {
    icon: string;
    label: string;
    open: boolean;
    hidden?: string;
  },
  contents: HtmlResult,
): HtmlResult => html`
  <div class="${classes("system-sub-menu", hidden)}">
    <a class="${classes(open && "open")}" on-click="openSubmenu">
      <i class="${classes("fa", icon)}" title="${label}"></i>
      <span>${label}</span>
      <i class="fa fa-caret-right"></i>
    </a>
    <div class="${classes("system-sub-menu", open && "open")}">${contents}</div>
  </div>
`;

/**
 * The action a submenu's toggle link runs. It changes nothing here - which
 * submenu is open is the root's business - so its whole job is to be announced.
 * The root reads *which* submenu asked off the element the event came from.
 */
export const openSubmenu = (): undefined => undefined;

/**
 * A menu command the online system doesn't implement. These deliberately leave
 * the menu open, so unlike a real command the root has no `on-<action>` listener
 * for one.
 */
export const reportNotImplemented = (): undefined => {
  showError(notImplemented);
  return undefined;
};
