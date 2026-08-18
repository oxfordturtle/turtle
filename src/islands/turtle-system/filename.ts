/// <reference lib="dom" />
import { define, html } from "@merivale/womble";
import type { File } from "./file.ts";
import {
  closeCurrentFile,
  getCurrentFileIndex,
  getFilename,
  getFiles,
  programStore,
  renameFile,
  selectFile,
} from "./program.ts";

// The bar above the editor: which file is open, what it's called, and a button
// to close it. It reads ./program.ts in `render` and has no state of its own.
//
// The `<input>` carries `.value` rather than a plain `value` attribute because
// something other than the user changes it - switching files, or opening one.
define("system-filename", {
  attributes: {},

  sources: [programStore],

  render: () => {
    const files = getFiles();
    const current = getCurrentFileIndex();
    return html`
      <div class="filename">
        <select aria-label="Current file" on-change="chooseFile">
          ${files.map(
            (file, index) => html`
              <option value="${index}" .selected="${index === current}">
                ${fileLabel(index, file)}
              </option>
            `,
          )}
        </select>
        <input
          type="text"
          placeholder="filename"
          aria-label="Filename"
          .value="${getFilename()}"
          on-change="renameCurrentFile"
        />
        <button title="Close current file" on-click="closeProgram">
          <i class="fa fa-times" aria-hidden="true"></i>
        </button>
      </div>
    `;
  },

  // Each of these returns `undefined`: what they change belongs to the store,
  // and the store notifies this component as part of the change.
  actions: {
    chooseFile: (_attributes, { element }) => {
      selectFile(Number((element as HTMLSelectElement).value));
      return undefined;
    },
    renameCurrentFile: (_attributes, { element }) => {
      renameFile((element as HTMLInputElement).value);
      return undefined;
    },
    closeProgram: () => {
      closeCurrentFile();
      return undefined;
    },
  },
});

const fileLabel = (index: number, file: File): string =>
  `${(index + 1).toString(10).padStart(2, "0")} [${file.language}] ${
    file.name || "[no name]"
  }`;
