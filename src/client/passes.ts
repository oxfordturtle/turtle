/// <reference lib="dom" />
import { highlight } from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import { getSettings } from "@/islands/settings.ts";
import { requestValidTab } from "@/islands/turtle-system/commands.ts";

/**
 * The three page-wide DOM passes, which have no component to hang off.
 *
 * All three sweep *static, server-rendered documentation prose* - large tracts
 * of it, scattered across the help and reference pages, that no island owns.
 * Anything *inside* an island derives its own visibility from the settings
 * instead, because these run before the islands hydrate and a component's first
 * render would wipe whatever they had just set. That is why the nine tab panes
 * deliberately carry no `data-mode` attribute.
 *
 * The client entry calls all three at startup and subscribes the last two to the
 * settings store.
 */

/**
 * One-time and never re-run: each block is highlighted in *its own*
 * `data-language`, not the currently selected one.
 */
export const highlightCodeBlocks = (): void => {
  const blocks = document.querySelectorAll(
    "code[data-language]",
  ) as NodeListOf<HTMLElement>;
  for (const block of Array.from(blocks)) {
    block.innerHTML = highlight(
      block.innerText,
      block.dataset.language as Language,
    );
  }
};

/** Shows the prose written for the current language, and hides the rest. */
export const languageVisibility = (): void => {
  const { language } = getSettings();
  const elements = document.querySelectorAll(
    "[data-language]",
  ) as NodeListOf<HTMLElement>;
  for (const element of Array.from(elements)) {
    if (language === element.dataset.language) {
      element.classList.remove("hidden");
    } else {
      element.classList.add("hidden");
    }
  }
};

/** Shows the prose that belongs to the current mode, and hides the rest. */
export const modeVisibility = (): void => {
  const { mode } = getSettings();
  const elements = document.querySelectorAll(
    "[data-mode]",
  ) as NodeListOf<HTMLElement>;

  for (const element of Array.from(elements)) {
    if (element.dataset.mode) {
      const modes = element.dataset.mode.split(",");
      if (modes.includes(mode)) {
        element.classList.remove("hidden");
      } else {
        element.classList.add("hidden");
      }
    }
  }

  // A tab pane this pass has just hidden can't be the one on show - but the
  // panes are components with no `data-mode` for this sweep to find, so the
  // system, which knows its own tabs, is asked rather than inspected.
  requestValidTab();
};
