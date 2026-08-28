/// <reference lib="dom" />
import { highlight } from "@/core/compiler.ts";
import type { Language } from "@/core/constants.ts";
import { getSettings } from "@/islands/settings.ts";

/**
 * The two jobs that belong to the document rather than to any component, because
 * `<body>` and the static documentation prose are both outside every island.
 *
 * **Neither of these corrects a first render.** That distinction is what this
 * module used to get wrong. It held three sweeps that ran after load and fixed
 * up markup the server had committed to wrongly - which meant a documentation
 * page showed all six languages and then hid five of them, and a page in Machine
 * mode was laid out for Normal mode first. Now the server knows the language,
 * the mode and the fullscreen preference from the request's cookie
 * (`cookieFields` in ../constants/properties.ts), and renders each of them
 * correctly the first time.
 *
 * What is left is:
 *
 * - `highlightCodeBlocks`, which *completes* rather than corrects - the server
 *   sends the code as plain text and this colours it in. It has no state to be
 *   wrong about, since every block declares its own language.
 * - `syncBodyState`, which keeps `<body>` in step when someone changes one of
 *   the two settings that live on it. That runs on a change, not on load.
 *
 * The two sweeps that went were `languageVisibility` - now three CSS rules keyed
 * off `<body data-language>` (style/screen/language.css) - and `modeVisibility`,
 * which turned out never to have done anything: it queried `[data-mode]`, and
 * the markup it was written for spells the attribute `modes`, so it swept an
 * empty list on every route. Everything mode-conditional derives its own
 * visibility through `hiddenUnless` instead.
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
    // textContent, not innerText: identical for these blocks (the server
    // renders them as plain escaped text, with real newlines and no markup),
    // and unlike innerText it exists in jsdom, which is what lets the layer 2
    // suite run this pass. A browser smoke test double-checks the rendered
    // result in real Chrome.
    // deno-coverage-ignore-start -- the `?? ""` fallback is unreachable:
    // `textContent` is null only on a document or doctype node, and this
    // query only ever yields elements.
    block.innerHTML = highlight(
      block.textContent ?? "",
      block.dataset.language as Language,
    );
    // deno-coverage-ignore-stop
  }
};

/**
 * The two settings that live on `<body>`, which no component can reach: the
 * language the stylesheet shows prose for, and the fullscreen class the layout
 * rules key off.
 *
 * The client entry calls this once at startup and subscribes it to the settings
 * store. The startup call writes back exactly what the server already rendered
 * - it is the subscription that does the work, when a person changes either.
 */
export const syncBodyState = (): void => {
  const { language, fullscreen } = getSettings();
  document.body.dataset.language = language;
  document.body.classList.toggle("fullscreen", fullscreen);
};
