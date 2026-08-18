import { define, html } from "@merivale/womble";
import { PCode, pcodeArgs } from "@/core/constants.ts";
import { getSettings } from "@/islands/settings.ts";
import "@/islands/setting-controls.ts";
import { getPcode, programStore } from "./program.ts";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The PCode tab: the compiled machine code, one list item per line of the
// program, shown either as assembler mnemonics or as raw numbers, in decimal or
// in hexadecimal. Both display options come from the settings store, which this
// pane follows through `sources`.
define("pcode-tab", {
  attributes: paneAttributes,
  sources: [...paneSources, programStore],
  render: ({ active }) => {
    const { assembler, decimal } = getSettings();
    return html`
      <div class="${paneClasses(active, "expert,machine")}">
        <div class="system-checkboxes">
          <setting-flag
            setting="assembler"
            group="pcodeOptions1"
            option="assembler"
            value="true"
            label="Assembler Code"
          />
          <setting-flag
            setting="assembler"
            group="pcodeOptions1"
            option="machine"
            value="false"
            label="Machine Code"
          />
          <setting-flag
            setting="decimal"
            group="pcodeOptions2"
            option="decimal"
            value="true"
            label="Decimal"
          />
          <setting-flag
            setting="decimal"
            group="pcodeOptions2"
            option="hexadecimal"
            value="false"
            label="Hexadecimal"
          />
        </div>
        <ol class="pcode">
          ${getPcode().map(
            (line) => html`
              <li>
                ${cells(line, assembler, decimal).map(
                  (cell) => html` <div>${cell}</div> `,
                )}
              </li>
            `,
          )}
        </ol>
      </div>
    `;
  },
});

/**
 * One line of PCode as the cells it displays as, padded out to a whole number
 * of rows of ten - the listing is a flex wrap, so a short last row would leave
 * the line's background showing through.
 */
const cells = (
  line: number[],
  assembler: boolean,
  decimal: boolean,
): string[] => {
  const content = assembler
    ? assemble(line, 0, decimal)
    : line.map((code) => cell(code, decimal));
  while (content.length % 10 > 0) content.push("");
  return content;
};

/** A line of PCode read as instructions and their arguments, from `index` on. */
const assemble = (
  line: number[],
  index: number,
  decimal: boolean,
): string[] => {
  const hit = PCode[line[index]];
  const pcode = hit ? [hit.toUpperCase()] : [cell(line[index], decimal)];
  let args = 0;
  if (hit) {
    if (pcodeArgs(line[index]) < 0) {
      // A negative argument count means a string: the next value is its
      // length, and that many character codes follow.
      const length = line[index + 1];
      pcode.push(cell(length, decimal));
      args += 1;
      while (args <= length) {
        args += 1;
        pcode.push(String.fromCharCode(line[index + args]));
      }
    } else {
      while (args < pcodeArgs(line[index])) {
        args += 1;
        pcode.push(cell(line[index + args], decimal));
      }
    }
  }
  if (index + args < line.length - 1) {
    return pcode.concat(assemble(line, index + args + 1, decimal));
  }
  return pcode;
};

const cell = (code: number | undefined, decimal: boolean): string => {
  if (code === null || code === undefined) return ":(";
  return decimal ? code.toString(10) : code.toString(16).toUpperCase();
};
