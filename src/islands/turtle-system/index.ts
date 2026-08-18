// Registers the system app: the root component first, then everything it
// renders. That order was load-bearing while the subtree resolved `context`
// against an ancestor — `define()` queues each registration on a microtask,
// FIFO, so a component upgrades in the order its module was evaluated, and one
// that upgraded before its provider got no context at all. No component here
// declares `context` any more (the settings are a store: @/islands/settings.ts),
// so the order is now only the obvious one to read.
//
// Import *this* module rather than `../turtle-system.ts`, which deliberately
// doesn't pull in its own subtree: an ES module's imports are hoisted above its
// body, so anything `turtle-system.ts` imported would register before
// `turtle-system` itself.
import "../turtle-system.ts";
import "./menu/file.ts";
import "./menu/edit.ts";
import "./menu/view.ts";
import "./menu/compile.ts";
import "./menu/run.ts";
import "./menu/options.ts";
import "./menu/examples.ts";
import "./filename.ts";
import "./editor.ts";
import "./properties.ts";
import "./transport.ts";
import "./canvas.ts";
import "./output.ts";
import "./usage.ts";
import "./comments.ts";
import "./syntax.ts";
import "./variables.ts";
import "./pcode.ts";
import "./memory.ts";
import "./options-tab.ts";
