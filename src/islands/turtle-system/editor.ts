/// <reference lib="dom" />
import {
  type CustomElement,
  define,
  definition,
  html,
  unsafeHtml,
} from "@merivale/womble";
import { highlight } from "@/core/compiler.ts";
import { getSettings, languageOf, settingsStore } from "@/islands/settings.ts";
import {
  getCode,
  getTokens,
  programStore,
  setCode,
  subscribe,
} from "./program.ts";

// The code editor: a `<textarea>` the user types into, with a syntax
// highlighted copy of the same text in a `<pre>` directly on top of it, and the
// line numbers down the side.
//
// **The textarea's value stays imperative**, which is the design constraint
// here. Re-assigning `textarea.value` from a template hole on every render would
// collapse the selection and wipe the browser's undo stack, on the very
// keystroke that produced the value being assigned. So the textarea carries no
// hole at all: it starts empty, and `syncTextarea` below pushes a value in only
// when the store's copy and the element's have diverged - which opening or
// switching files does, and typing doesn't.
//
// Everything else on screen is derived, and so is ordinary rendered markup.
// Only the overlay's *width* can't be computed from state, being a measurement
// of laid-out text; a `ResizeObserver` on the `<pre>` feeds it back, which also
// covers a font change.
//
// Written through `definition()` rather than passed straight to `define()` so
// that its type can be named, which is what gives
// `document.querySelector("system-editor")` the `selectAllCode` method the Edit
// menu's "Select All" calls on it (see ./commands.ts).
const systemEditor = definition({
  // the code itself lives in ./program.ts, so this component has no state of
  // its own
  attributes: {},

  sources: [programStore, settingsStore],

  render: () => {
    const settings = getSettings();
    const lines = getCode().split("\n");
    const height = `height: ${(lines.length * 1.5).toString(10)}em`;
    return html`
      <div
        class="editor"
        style="${`font-family: ${settings.editorFontFamily}; font-size: ${settings.editorFontSize}px`}"
      >
        <ol class="line-numbers" style="${height}">
          ${lines.map(
            (_line, index) => html` <li>${(index + 1).toString(10)}</li> `,
          )}
        </ol>
        <div class="code-wrapper">
          <textarea
            wrap="off"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            autofocus
            style="${height}"
            on-input="editCode"
            on-keydown="pressKey"
          ></textarea>
          <pre style="${height}"><code>${unsafeHtml(
            highlight(getTokens(), languageOf(settings)),
          )}</code></pre>
        </div>
      </div>
    `;
  },

  actions: {
    // Every action that changes the program returns `undefined`: the store
    // notifies as part of the change, and that is what re-renders. Returning
    // anything would commit a second time for the same keystroke.
    editCode: (_attributes, { element }) => {
      setCode((element as HTMLTextAreaElement).value);
      return undefined;
    },

    // Tab inserts two spaces rather than leaving the field, and Enter scrolls
    // the code back to the left margin. `keydown` is a native event name, so the
    // action can't be called that.
    pressKey: (_attributes, { event, element }) => {
      const textarea = element as HTMLTextAreaElement;
      // only reached from the keydown listener, which is what fills `event`
      const keydown = event as KeyboardEvent;
      const key = keydown.key;
      if (key === "Tab") {
        keydown.preventDefault();
        const position = textarea.selectionStart;
        textarea.value = `${textarea.value.slice(0, position)}  ${textarea.value.slice(
          position,
        )}`;
        // before the selection is restored: this re-renders, and the sync below
        // leaves an unchanged value, and so the selection, alone
        setCode(textarea.value);
        textarea.selectionStart = position + 2;
        textarea.selectionEnd = position + 2;
      }
      if (key === "Enter") {
        const wrapper = textarea.parentElement as HTMLElement;
        wrapper.scrollLeft = 0;
      }
      return undefined;
    },

    // The Edit menu's "Select All", reaching this component from outside its
    // subtree (see ../commands.ts). Being an action rather than a listener is
    // what makes it addressable at all.
    selectAllCode: (_attributes, { element }) => {
      const textarea = element.querySelector("textarea") as HTMLTextAreaElement;
      textarea.focus();
      textarea.select();
      return undefined;
    },
  },

  effects: {
    // The imperative half. Mounts once, after the first render, so everything
    // it queries exists; Womble patches the same nodes on every later render.
    editorDom: ({ element }) => {
      const textarea = element.querySelector("textarea") as HTMLTextAreaElement;
      const pre = element.querySelector("pre") as HTMLPreElement;
      const lineNumbers = element.querySelector(".line-numbers") as HTMLElement;
      const wrapper = element.querySelector(".code-wrapper") as HTMLElement;

      // The deliberate, occasional `textarea.value = ...`. Guarded, so a
      // keystroke - where the store's copy is already what the element holds -
      // never touches the live value.
      const syncTextarea = (): void => {
        const code = getCode();
        if (textarea.value !== code) textarea.value = code;
      };

      // Its own subscription, since the textarea's value is deliberately not a
      // template hole. Womble subscribes when the element connects, before this
      // effect mounts, so the re-render still happens before the value goes in.
      const unsubscribe = subscribe(syncTextarea);
      syncTextarea();

      // how wide the highlighted code is can only be measured, so the
      // textarea's width is the one thing `render` above doesn't set
      const observer = new ResizeObserver(() => {
        textarea.style.width = `${pre.scrollWidth.toString(10)}px`;
      });
      observer.observe(pre);

      // Keeps the line numbers level with the code, and stops a small
      // horizontal scroll leaving the first column half hidden.
      const onScroll = (): void => {
        lineNumbers.scrollTop = wrapper.scrollTop;
        if (wrapper.scrollLeft <= 8) wrapper.scrollLeft = 0;
      };
      wrapper.addEventListener("scroll", onScroll);

      return () => {
        unsubscribe();
        observer.disconnect();
        wrapper.removeEventListener("scroll", onScroll);
      };
    },
  },
});

define("system-editor", systemEditor);

declare global {
  interface HTMLElementTagNameMap {
    "system-editor": CustomElement<typeof systemEditor>;
  }
}
