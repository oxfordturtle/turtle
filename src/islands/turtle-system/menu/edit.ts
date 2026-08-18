import { define, html } from "@merivale/womble";
import { getSettings, hiddenUnless } from "@/islands/settings.ts";
import {
  menuSources,
  openSubmenu,
  reportNotImplemented,
  submenu,
} from "../menu.ts";
import { requestSelectAll } from "../commands.ts";
import { backupCode, restoreCode } from "../program.ts";
import { editingNotImplemented } from "../editing.ts";

// The system menu's Edit submenu. "Store copy"/"Restore previous version" are
// file operations and go to the file store; "Select All" reaches the editor
// component, which is the only thing that can answer it.
//
// The five clipboard and history commands above them have never done anything,
// and say so rather than silently doing nothing - see ../editing.ts.
//
// Note the action names: `copy`, `cut`, `paste` and `select` are all real DOM
// events, and Womble refuses to announce an action named after one, so they
// carry a suffix here (see src/islands/lib.ts's conventions).
define("edit-menu", {
  attributes: { open: false },
  sources: menuSources,
  render: ({ open }) => {
    const { mode } = getSettings();
    return submenu(
      { icon: "fa-edit", label: "Edit", open },
      html`
        <a on-click="undoEdit"><span>Undo</span></a>
        <a on-click="redoEdit"><span>Redo</span></a>
        <hr />
        <a on-click="cutSelection"><span>Cut</span></a>
        <a on-click="copySelection"><span>Copy</span></a>
        <a on-click="pasteClipboard"><span>Paste</span></a>
        <hr />
        <a
          class="${hiddenUnless(mode, "normal,expert,machine")}"
          on-click="selectAllCode"
        >
          <span>Select All</span>
        </a>
        <a on-click="notImplemented"><span>Find and replace</span></a>
        <hr />
        <a on-click="notImplemented"><span>Auto-format program</span></a>
        <hr class="${hiddenUnless(mode, "normal,expert,machine")}" />
        <a
          class="${hiddenUnless(mode, "normal,expert,machine")}"
          on-click="storeCopy"
        >
          <span>Store copy of program</span>
        </a>
        <a
          class="${hiddenUnless(mode, "normal,expert,machine")}"
          on-click="restoreCopy"
        >
          <span>Restore previous version</span>
        </a>
      `,
    );
  },
  actions: {
    openSubmenu,
    undoEdit: editingNotImplemented,
    redoEdit: editingNotImplemented,
    cutSelection: editingNotImplemented,
    copySelection: editingNotImplemented,
    pasteClipboard: editingNotImplemented,
    selectAllCode: (): undefined => {
      requestSelectAll();
      return undefined;
    },
    storeCopy: (): undefined => {
      backupCode();
      return undefined;
    },
    restoreCopy: (): undefined => {
      restoreCode();
      return undefined;
    },
    notImplemented: reportNotImplemented,
  },
});
