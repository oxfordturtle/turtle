import { define, html, unsafeHtml } from "@merivale/womble";
import {
  type Command,
  commandCategories,
  type Language,
} from "@/core/constants.ts";
import { highlight } from "@/core/compiler.ts";
import { getSettings, languageOf, settingsStore } from "@/islands/settings.ts";

// The category/level filter is **ephemeral view state**: this island's own
// attributes, persisted nowhere. It used to be four `localStorage` properties
// with a mount effect to reconcile them, which meant every visit rendered the
// table one way on the server and then corrected it in the browser. A filter on
// a reference table is not worth that, so the table simply starts where the
// server said it does and the correction has nothing left to do.
//
// `language`, by contrast, is shared and persisted, so it comes from the store -
// and the server renders the right one, because it is a cookie field.
//
// The filter controls keep their `.checked`/`.selected` property bindings: a
// re-render for a *language* change still has to reassert them, and a plain
// attribute would only set the control's reset default. The `<option>`'s plain
// `value` is its identity, which `setCategory` reads back.
//
// Every boolean defaults to `false`, as Womble requires. `simple` is the one
// that should start on, so the call site says so explicitly -
// `<command-table simple />` in src/pages/documentation/reference.ts.
const attributes = {
  category: 0,
  simple: false,
  intermediate: false,
  advanced: false,
};

define("command-table", {
  attributes,
  sources: [settingsStore],
  render: ({ category, simple, intermediate, advanced }) => {
    const language = languageOf(getSettings());
    const current = commandCategories[category] ?? commandCategories[0];
    const commands = visibleCommands(
      current.expressions as Command[],
      language,
      simple,
      intermediate,
      advanced,
    );
    return html`
      <div class="commands-table-options">
        <select on-change="setCategory">
          ${commandCategories.map(
            (c) => html`
              <option
                value="${c.index}"
                .selected="${c.index === current.index}"
              >
                ${c.index + 1}. ${c.title}
              </option>
            `,
          )}
        </select>
        <div class="checkboxes">
          <label
            ><input
              type="checkbox"
              .checked="${simple}"
              on-change="toggleSimple"
            />
            Simple</label
          >
          <label
            ><input
              type="checkbox"
              .checked="${intermediate}"
              on-change="toggleIntermediate"
            />
            Intermediate</label
          >
          <label
            ><input
              type="checkbox"
              .checked="${advanced}"
              on-change="toggleAdvanced"
            />
            Advanced</label
          >
        </div>
      </div>
      <table class="commands-table">
        <thead>
          <tr>
            <th>Command</th>
            <th>Parameters</th>
            <th>Returns</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${
            // unsafeHtml() rather than escaping holes: the highlighter returns
            // spans, and a command's `description` embeds literal
            // "<code>...</code>" of its own. Both come from src/core, which is
            // this repo's own data - the trust the name asks for. `returns` is
            // a bare type name, so it stays an ordinary hole.
            commands.map(
              (command) => html`
                <tr>
                  <td>
                    ${unsafeHtml(
                      `<code>${highlight(
                        command.names[language] as string,
                        language,
                      )}</code>`,
                    )}
                  </td>
                  <td>
                    ${unsafeHtml(
                      command.parameters
                        .map(
                          (p) =>
                            `<code>${highlight(
                              p.name,
                              language,
                            )}</code> (${p.type})`,
                        )
                        .join("<br>"),
                    )}
                  </td>
                  <td>${command.returns || "-"}</td>
                  <td>${unsafeHtml(command.description)}</td>
                </tr>
              `,
            )
          }
        </tbody>
      </table>
    `;
  },
  actions: {
    setCategory: (_attributes, { event }) => ({
      category: Number((event!.target as HTMLSelectElement).value),
    }),
    toggleSimple: (_attributes, { event }) => ({
      simple: (event!.target as HTMLInputElement).checked,
    }),
    toggleIntermediate: (_attributes, { event }) => ({
      intermediate: (event!.target as HTMLInputElement).checked,
    }),
    toggleAdvanced: (_attributes, { event }) => ({
      advanced: (event!.target as HTMLInputElement).checked,
    }),
  },
  // No effects: with nothing persisted there is nothing to reconcile against.
});

const visibleCommands = (
  expressions: readonly Command[],
  language: Language,
  showSimple: boolean,
  showIntermediate: boolean,
  showAdvanced: boolean,
): Command[] => {
  let commands = expressions;
  if (!showSimple) commands = commands.filter((x) => x.level !== 0);
  if (!showIntermediate) commands = commands.filter((x) => x.level !== 1);
  if (!showAdvanced) commands = commands.filter((x) => x.level !== 2);
  return commands.filter((x) => x.names[language]);
};
