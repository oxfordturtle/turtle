import { define, html, unsafeHtml } from "@merivale/womble";
import {
  type Command,
  commandCategories,
  type Language,
} from "@/core/constants.ts";
import { highlight } from "@/core/compiler.ts";
import { load, save } from "@/client/state/storage.ts";
import { getSettings, languageOf, settingsStore } from "@/islands/settings.ts";

// The category/level filter is this island's own state rather than the settings
// store's: it is the one settings group no other component on any page reads.
// It persists to the same `sessionStorage` keys it always has
// (`commandsCategoryIndex`, `showSimpleCommands`, …), which is why the attribute
// names here are shorter than the keys they reconcile against. `language`, by
// contrast, is shared, so it comes from the store.
//
// The filter controls are written with `.checked`/`.selected` property bindings,
// because `restoreFromStorage` changes them from outside the controls
// themselves; the `<option>`'s plain `value` is its identity, which `setCategory`
// reads back.
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
    setCategory: (_attributes, { event }) => {
      const category = Number((event!.target as HTMLSelectElement).value);
      save("commandsCategoryIndex", category);
      return { category };
    },
    toggleSimple: (_attributes, { event }) => {
      const simple = (event!.target as HTMLInputElement).checked;
      save("showSimpleCommands", simple);
      return { simple };
    },
    toggleIntermediate: (_attributes, { event }) => {
      const intermediate = (event!.target as HTMLInputElement).checked;
      save("showIntermediateCommands", intermediate);
      return { intermediate };
    },
    toggleAdvanced: (_attributes, { event }) => {
      const advanced = (event!.target as HTMLInputElement).checked;
      save("showAdvancedCommands", advanced);
      return { advanced };
    },
    // Called as a method by the `restoreFromStorage` effect below, never by a
    // DOM event, so what it reads is its own declared parameters.
    restore: {
      params: {
        category: 0,
        simple: false,
        intermediate: false,
        advanced: false,
      },
      run: (_attributes, { params }) => ({
        category: params.category as number,
        simple: params.simple as boolean,
        intermediate: params.intermediate as boolean,
        advanced: params.advanced as boolean,
      }),
    },
  },
  effects: {
    // Runs once on mount, correcting the server-rendered defaults to whatever
    // this browser last saved. The re-render reaches the controls' *live* state
    // only because they are property bindings; a plain attribute would set only
    // their reset default.
    restoreFromStorage: ({ element }) => {
      element.restore({
        category: load("commandsCategoryIndex"),
        simple: load("showSimpleCommands"),
        intermediate: load("showIntermediateCommands"),
        advanced: load("showAdvancedCommands"),
      });
    },
  },
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
