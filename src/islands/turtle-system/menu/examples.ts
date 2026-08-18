import { define, html } from "@merivale/womble";
import {
  type Example,
  exampleGroups,
  type Language,
} from "@/core/constants.ts";
import { classes } from "@/islands/lib.ts";
import "@/islands/setting-controls.ts";
import { getSettings, languageOf } from "@/islands/settings.ts";
import { menuSources, submenu } from "../menu.ts";
import { openExampleFile } from "../program.ts";

// The system menu's Examples submenu, and the one submenu with a third level:
// each group of examples opens a panel of its own beside the list of groups.
// Which group is open is this component's own business, so unlike `open` it is
// not a prop; one open at a time falls out of `group` being one string.
define("examples-menu", {
  attributes: {
    open: false,
    group: "",
  },
  sources: menuSources,
  render: ({ open, group }) => {
    const language = languageOf(getSettings());
    return submenu(
      { icon: "fa-life-ring", label: "Examples", open },
      html`
        ${exampleGroups.map(
          (exampleGroup) => html`
            <a
              class="${classes(group === exampleGroup.id && "open")}"
              data-group="${exampleGroup.id}"
              on-click="openGroup"
            >
              <span>${groupLabel(exampleGroup.index, exampleGroup.title)}</span>
              <i class="fa fa-caret-right" aria-hidden="true"></i>
            </a>
          `,
        )}
        ${exampleGroups.map(
          (exampleGroup) => html`
            <div
              class="${classes(
                "system-sub-menu",
                group === exampleGroup.id && "open",
              )}"
            >
              <a data-group="${exampleGroup.id}" on-click="openGroup">
                <i class="fa fa-caret-left" aria-hidden="true"></i>
                <span>back</span>
              </a>
              ${available(exampleGroup.examples, language).map(
                (example) => html`
                  <a data-example="${example.id}" on-click="openExample">
                    <span>${example.names[language]}</span>
                  </a>
                `,
              )}
            </div>
          `,
        )}
        <hr />
        <setting-checkbox
          setting="includeCommentsInExamples"
          label="Include comments within example programs"
          disabled
        />
        <setting-checkbox
          setting="loadCorrespondingExample"
          label="Load corresponding example on language switch"
        />
      `,
    );
  },
  actions: {
    // the only submenu whose toggle link changes something of its own: coming
    // back to it starts at the list of groups
    openSubmenu: () => ({ group: "" }),
    // Both the group link and its "back" link run this: opening the group
    // that's already open closes it, which is what `back` means.
    openGroup: (attributes, { element }) => {
      const id = element.dataset.group ?? "";
      return { group: attributes.group === id ? "" : id };
    },
    openExample: (_attributes, { element }) => {
      openExampleFile(element.dataset.example as string);
      return undefined;
    },
  },
});

// The groups are rendered as two flat runs of siblings — every group's link,
// then every group's panel — because that's the shape the stylesheet expects:
// `.system-sub-menu .system-sub-menu .system-sub-menu` positions a third-level
// panel absolutely over the second, so it can't be nested inside its own link.
const groupLabel = (index: number, title: string): string =>
  `Examples ${index.toString(10)} - ${title}`;

const available = (
  examples: ReadonlyArray<Example>,
  language: Language,
): ReadonlyArray<Example> =>
  examples.filter((example) => example.names[language] != null);
