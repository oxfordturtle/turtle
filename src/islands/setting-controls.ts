/// <reference lib="dom" />
import { define, html } from "@merivale/womble";
import { showError, SystemError } from "@/client/tools/error.ts";
import {
  getSettings,
  hiddenUnless,
  type SettingName,
  setSetting,
  settingsStore,
} from "./settings.ts";

// One small component per *kind* of settings control, used wherever that kind
// appears. Each reads and writes the settings store (./settings.ts) directly
// rather than taking its value as a prop, which reduces a call site to the two
// things that vary - which setting, and what to call it:
//
//     <setting-checkbox setting="showCanvasOnRun" label="Show Canvas on RUN" />
//
// Note which holes carry a leading dot. `.checked`, `.selected` and `.value`
// write the element's *live* DOM property, which is what a control needs when
// something other than the user can change it - "Reset settings to default", or
// the same setting being edited on another page. Plain `value="${...}"` on an
// `<option>` or a radio is deliberate: that is the value the control *submits*,
// its fixed identity, not what it displays.

/** a checkbox and its label; `disabled` ones report that they aren't implemented */
define("setting-checkbox", {
  attributes: {
    setting: "",
    label: "",
    // a comma-separated list; empty means "visible in every mode". A delimited
    // string is the only way an attribute carries a list at all.
    modes: "",
    disabled: false,
  },
  sources: [settingsStore],
  render: ({ setting, label, modes, disabled }) => {
    const settings = getSettings();
    return html`
      <label
        class="${visibility(settings.mode, modes)}"
        on-click="reportDisabled"
      >
        <input
          type="checkbox"
          .checked="${settings[setting as SettingName] === true}"
          disabled="${disabled}"
          on-change="toggleSetting"
        />
        <span>${label}</span>
      </label>
    `;
  },
  actions: {
    toggleSetting: (attributes, { element }) => {
      setSetting(
        attributes.setting as SettingName,
        (element as HTMLInputElement).checked,
      );
      return undefined;
    },
    // a click on an *enabled* label is the browser forwarding it to the
    // checkbox, so this must no-op there
    reportDisabled: (attributes) => {
      if (attributes.disabled) showError(optionNotImplemented);
      return undefined;
    },
  },
});

/** one radio of a group standing for the setting's value */
define("setting-radio", {
  attributes: {
    setting: "",
    label: "",
    /** the radio group's `name`, shared by every radio standing for one setting */
    group: "",
    /** the value this radio selects, as a string even when the setting is a number */
    value: "",
    numeric: false,
  },
  sources: [settingsStore],
  render: ({ setting, label, group, value }) => {
    const settings = getSettings();
    return html`
      <label>
        <input
          type="radio"
          name="${group}"
          value="${value}"
          .checked="${String(settings[setting as SettingName]) === value}"
          on-change="chooseValue"
        />
        <span>${label}</span>
      </label>
    `;
  },
  actions: {
    chooseValue: (attributes, { element }) => {
      // a radio only reports the option just selected; the deselected one fires
      // no event of its own
      if (!(element as HTMLInputElement).checked) return undefined;
      setSetting(
        attributes.setting as SettingName,
        attributes.numeric ? Number(attributes.value) : attributes.value,
      );
      return undefined;
    },
  },
});

/**
 * One radio of a pair standing for one *boolean* setting (assembler/machine
 * code, decimal/hexadecimal). Which boolean each radio means is fixed markup,
 * so it's a prop rather than something read off the control, and the label is
 * bare text rather than a `<span>` - `.system-checkboxes` gives a `<span>` its
 * own 50% flex basis, which would put each of these on a line of its own.
 */
define("setting-flag", {
  attributes: {
    setting: "",
    label: "",
    group: "",
    value: false,
    option: "",
  },
  sources: [settingsStore],
  render: ({ setting, label, group, value, option }) => {
    const settings = getSettings();
    return html`
      <label>
        <input
          type="radio"
          name="${group}"
          value="${option}"
          .checked="${settings[setting as SettingName] === value}"
          on-change="chooseFlag"
        />
        ${label}
      </label>
    `;
  },
  actions: {
    chooseFlag: (attributes, { element }) => {
      if (!(element as HTMLInputElement).checked) return undefined;
      setSetting(attributes.setting as SettingName, attributes.value);
      return undefined;
    },
  },
});

/**
 * A labelled `<select>` over a fixed list of string values. `options` is a
 * comma-separated string because no attribute in HTML carries a list; anything
 * bigger or more structured belongs in a store or in call-site children.
 */
define("setting-select", {
  attributes: {
    setting: "",
    label: "",
    options: "",
  },
  sources: [settingsStore],
  render: ({ setting, label, options }) => {
    const settings = getSettings();
    const current = String(settings[setting as SettingName]);
    return html`
      <label>
        <span>${label}</span>
        <select on-change="chooseOption">
          ${options
            .split(",")
            .map(
              (option) => html`
                <option value="${option}" .selected="${option === current}">
                  ${option}
                </option>
              `,
            )}
        </select>
      </label>
    `;
  },
  actions: {
    chooseOption: (attributes, { element }) => {
      setSetting(
        attributes.setting as SettingName,
        (element as HTMLSelectElement).value,
      );
      return undefined;
    },
  },
});

/** a labelled number input, for the settings held in the system menu */
define("setting-number", {
  attributes: {
    setting: "",
    label: "",
  },
  sources: [settingsStore],
  render: ({ setting, label }) => {
    const settings = getSettings();
    return html`
      <label>
        <span>${label}</span>
        <input
          type="number"
          .value="${settings[setting as SettingName]}"
          on-change="setNumber"
        />
      </label>
    `;
  },
  actions: {
    setNumber: (attributes, { element }) => {
      setSetting(
        attributes.setting as SettingName,
        Number((element as HTMLInputElement).value),
      );
      return undefined;
    },
  },
});

/** what a menu command that the online system doesn't do yet reports */
export const notImplemented = new SystemError(
  "This feature has not yet been implemented in the online system.",
);

const optionNotImplemented = new SystemError(
  "This option cannot yet be modified in the online system.",
);

const visibility = (mode: string, modes: string): string =>
  modes === "" ? "" : hiddenUnless(mode, modes);
