import { define, html } from "@merivale/womble";
import { colours, type Language } from "@/core/constants.ts";
import { getSettings, languageOf, settingsStore } from "@/islands/settings.ts";

// `language` comes from the settings store (src/islands/settings.ts), so this
// table re-renders whenever the language <select> beside it changes. It holds
// no state of its own as a result: the store's getters answer on the server
// too, so the initial markup is already right.
define("colour-table", {
  attributes: {},
  sources: [settingsStore],
  render: () => {
    const language = languageOf(getSettings());
    return html`
      <table>
        <thead>
          <tr>
            <th>No.</th>
            <th>Name<br />Value</th>
            <th>No.</th>
            <th>Name<br />Value</th>
            <th>No.</th>
            <th>Name<br />Value</th>
            <th>No.</th>
            <th>Name<br />Value</th>
            <th>No.</th>
            <th>Name<br />Value</th>
          </tr>
        </thead>
        <tbody>
          ${chunk(colours, 5).map(
            (row) => html`
              <tr>
                ${row.map(
                  (colour) => html`
                    <th>${colour.index}</th>
                    <td
                      style="background:#${colour.hex};color:${colour.dark
                        ? "white"
                        : "black"}"
                    >
                      ${colour.names[language]}<br />${hex(
                        language,
                        colour.hex,
                      )}
                    </td>
                  `,
                )}
              </tr>
            `,
          )}
        </tbody>
      </table>
    `;
  },
});

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
};

// No default case, matching the original (client/components/reference/colours.ts):
// C/Java/TypeScript fall through to `undefined`, which renders as the
// literal text "undefined" — a pre-existing bug, preserved here rather than
// silently fixed. Worth a follow-up ticket, flagged separately.
const hex = (language: Language, value: string): string | undefined => {
  switch (language) {
    case "BASIC":
      return `&${value}`;
    case "Pascal":
      return `$${value}`;
    case "Python":
      return `0x${value}`;
  }
};
