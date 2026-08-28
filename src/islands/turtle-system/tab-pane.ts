import { classes } from "@/islands/lib.ts";
import {
  getSettings,
  hiddenUnless,
  settingsStore,
} from "@/islands/settings.ts";

// What the tab-pane components share. Each renders one `.system-tab-pane`, and
// which one is showing arrives as the `active` prop, re-asserted on every one of
// `<turtle-system>`'s renders.
//
// A pane derives both its visibilities from state rather than being swept: the
// page-wide passes run before the islands hydrate, so a pane's first render
// would wipe whatever they had just set. That is also why these carry no
// `data-mode` - being found by that sweep is what they must avoid.
//
// `mode` comes from the settings store, which any component can follow from
// wherever it sits. `active` doesn't, because `<turtle-system>` writes all nine
// tags in its own render, which makes it their call site.

/** the store every pane follows: the mode we're in. Which tab is showing is a prop. */
export const paneSources = [settingsStore];

/**
 * A plain attribute rather than `Live`, because the call site owns it outright:
 * a pane never shows or hides itself, so its attribute and its state can't
 * disagree.
 */
export const paneAttributes = { active: false };

/**
 * Shown when it's the active tab, hidden outright in a mode it doesn't belong
 * to. An empty `modes` means every mode.
 */
export const paneClasses = (active: boolean, modes: string): string =>
  classes(
    "system-tab-pane",
    active && "active",
    modes === "" ? "" : hiddenUnless(getSettings().mode, modes),
  );

/**
 * The output font, as two custom properties for the pane wrapper to carry. The
 * Output tab's `<pre>` and the Canvas tab's console both consume them
 * (style/screen/system/body/main/tabs/), the way `.editor` does for the editor
 * font.
 *
 * **Custom properties on the wrapper, not `font-family` on the `<pre>`.** The
 * two `<pre>`s are written to imperatively by the machine's output port, which
 * sets `style.background` on them - and `<canvas-tab>` re-renders on every
 * machine notification, so a `style` hole of our own on the same element would
 * patch that background away mid-run. A custom property on the parent reaches
 * them without ever touching their `style` attribute, and affects nothing else,
 * since only these two rules consume it.
 */
export const paneFontVariables = (): string => {
  const { outputFontFamily, outputFontSize } = getSettings();
  return `--output-font-family: ${outputFontFamily}; --output-font-size: ${outputFontSize}px`;
};
