import { define, html } from "@merivale/womble";
import { languages } from "@/core/constants.ts";
import { getSettings, setSetting, settingsStore } from "./settings.ts";

// The language <select>. It appears three times - in the system header
// (src/islands/turtle-system.ts) and on the help and reference pages - which is
// exactly why the language is a store shared by
// every page (src/islands/settings.ts) rather than state on the system app.
//
// It doesn't go through the shared `setting-select` component: the options here
// are labelled ("Turtle Python") rather than being their own values, and it
// carries no `<span>` label of its own.
define("language-select", {
  attributes: {},
  sources: [settingsStore],
  render: () => {
    const { language } = getSettings();
    return html`
      <select aria-label="language" on-change="chooseLanguage">
        ${languages.map(
          (name) => html`
            <option value="${name}" .selected="${name === language}">
              Turtle ${name}
            </option>
          `,
        )}
      </select>
    `;
  },
  actions: {
    chooseLanguage: (_attributes, { element }) => {
      setSetting("language", (element as HTMLSelectElement).value);
      return undefined;
    },
  },
});
