import { showError, SystemError } from "@/client/tools/error.ts";

/**
 * Undo, Redo, Cut, Copy and Paste in the Edit menu, none of which is
 * implemented - see src/README.md's "Known gaps". They report that, rather than
 * looking enabled and doing nothing.
 */
export const editingNotImplemented = (): undefined => {
  showError(notImplementedInBrowser);
  return undefined;
};

const notImplementedInBrowser = new SystemError(
  "This command is not available in the online system - use the keyboard shortcut instead.",
);
