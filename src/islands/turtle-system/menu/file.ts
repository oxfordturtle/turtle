import { define, html } from "@merivale/womble";
import { getSettings, hiddenUnless } from "@/islands/settings.ts";
import {
  menuSources,
  openSubmenu,
  reportNotImplemented,
  submenu,
} from "../menu.ts";
import {
  closeCurrentFile,
  newFile,
  openLocalFile,
  saveLocalFile,
} from "../program.ts";

// The system menu's File submenu. Each command calls the file memory in
// ../program.ts, then dismisses the menu.
define("file-menu", {
  attributes: { open: false },
  sources: menuSources,
  render: ({ open }) => {
    const { mode } = getSettings();
    return submenu(
      { icon: "fa-folder-open", label: "File", open },
      html`
        <a on-click="newProgram"><span>New program</span></a>
        <a on-click="newSkeletonProgram"><span>Skeleton program</span></a>
        <a on-click="openProgram"><span>Open program</span></a>
        <a on-click="saveProgram"><span>Save program as ...</span></a>
        <a
          class="${hiddenUnless(mode, "expert,machine")}"
          on-click="notImplemented"
        >
          <span>Save Export/Upload file</span>
        </a>
        <a on-click="closeProgram"><span>Close program</span></a>
        <hr class="${hiddenUnless(mode, "normal,expert,machine")}" />
        <a
          class="${hiddenUnless(mode, "normal,expert,machine")}"
          on-click="notImplemented"
        >
          <span>Copy canvas graphic to clipboard</span>
        </a>
        <a
          class="${hiddenUnless(mode, "normal,expert,machine")}"
          on-click="notImplemented"
        >
          <span>Save canvas graphic to file</span>
        </a>
        <hr class="${hiddenUnless(mode, "expert,machine")}" />
        <a
          class="${hiddenUnless(mode, "expert,machine")}"
          on-click="notImplemented"
        >
          <span>Print program</span>
        </a>
        <a
          class="${hiddenUnless(mode, "expert,machine")}"
          on-click="notImplemented"
        >
          <span>Print text in Output tab</span>
        </a>
        <a
          class="${hiddenUnless(mode, "expert,machine")}"
          on-click="notImplemented"
        >
          <span>Print text in Console</span>
        </a>
      `,
    );
  },
  // Each command does its work and returns nothing; the announce is what
  // dismisses the menu, through the root's `on-<action>="closeMenu"`.
  actions: {
    openSubmenu,
    newProgram: (): undefined => {
      newFile(false);
      return undefined;
    },
    newSkeletonProgram: (): undefined => {
      newFile(true);
      return undefined;
    },
    openProgram: (): undefined => {
      openLocalFile();
      return undefined;
    },
    saveProgram: (): undefined => {
      saveLocalFile();
      return undefined;
    },
    closeProgram: (): undefined => {
      closeCurrentFile();
      return undefined;
    },
    notImplemented: reportNotImplemented,
  },
});
