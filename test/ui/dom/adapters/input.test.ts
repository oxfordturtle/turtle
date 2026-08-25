import { assertNoWombleLogs, coreMachine } from "../../lib/setup.ts";
import { assert, assertEquals, assertFalse } from "@std/assert";
import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";

const { PCode } = await import("@/core/constants.ts");
const { fakeCanvas, fakeFiles, fakeOutput, fakeTimers } = await import(
  "../../../core/machine/lib/fakes.ts"
);
const { attachInput } = await import("@/client/adapters/input.ts");

/**
 * The input port (src/client/adapters/input.ts): the one *driving* port, which
 * turns browser events into the machine's `update*` calls.
 *
 * Nothing is mounted here. `attachInput` takes the canvas element and installs
 * the listeners itself, so handing it an element this file made is the whole of
 * the wiring, and the events are the real thing dispatched at it. What comes
 * out the other end is the machine's query state, which the barrel doesn't
 * expose - so, exactly as `test/core/machine/input.test.ts` does it, each test
 * starts a tiny pcode program paused on WAIT, dispatches its events into the
 * pause, and lets the program resume and write the query values it wants back
 * out through the output port.
 */

// The DOM shim installs a document but not the constructors a real window
// carries, and `isEditableTarget` is `instanceof` checks against exactly
// these three. In a browser they are simply there.
const window = document.defaultView as unknown as Window & typeof globalThis;
// deno-lint-ignore no-explicit-any
const globals = globalThis as any;
globals.HTMLElement = window.HTMLElement;
globals.HTMLInputElement = window.HTMLInputElement;
globals.HTMLTextAreaElement = window.HTMLTextAreaElement;

// The keyboard listeners go on the *window* - a running program reads the
// keyboard with nothing in particular focused - which under Deno means the
// bare global `addEventListener`, i.e. Deno's own registry. Deno's
// `dispatchEvent` rejects a jsdom event, and `setupDom` has replaced the
// global `Event` with jsdom's, so keyboard events have to be built from Deno's
// class. `ErrorEvent` is still Deno-native, and its prototype is Deno's
// `Event`.
const DenoEvent = Object.getPrototypeOf(ErrorEvent) as typeof Event;

type Modifiers = { shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean };

const keyEvent = (
  type: string,
  key: string,
  keyCode: number,
  { target, ...modifiers }: Modifiers & { target?: unknown } = {},
): Event => {
  const event = new DenoEvent(type, { cancelable: true });
  Object.defineProperties(event, {
    key: { value: key },
    keyCode: { value: keyCode },
    shiftKey: { value: modifiers.shiftKey ?? false },
    altKey: { value: modifiers.altKey ?? false },
    ctrlKey: { value: modifiers.ctrlKey ?? false },
    // left alone when the test doesn't name one, in which case dispatching at
    // the global sets it to the window - which is no editable element, exactly
    // as a keystroke with nothing focused
    ...(target ? { target: { value: target } } : {}),
  });
  return event;
};

/** A jsdom mouse event, dispatched at the canvas, where those listeners are. */
const mouseEvent = (
  type: string,
  properties: {
    clientX?: number;
    clientY?: number;
    button?: number;
  } & Modifiers = {},
): MouseEvent =>
  new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...properties,
  });

/**
 * A touch event. jsdom has no `TouchEvent`, and the adapter reads nothing off
 * one but `touches` and the three modifier flags, so a plain event carrying
 * those is the same event as far as this module is concerned.
 */
const touchEvent = (
  type: string,
  touches: Array<{ clientX: number; clientY: number }>,
  modifiers: Modifiers = {},
): Event => {
  const event = new window.Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    touches: { value: touches },
    shiftKey: { value: modifiers.shiftKey ?? false },
    altKey: { value: modifiers.altKey ?? false },
    ctrlKey: { value: modifiers.ctrlKey ?? false },
  });
  return event;
};

// A canvas 500 CSS pixels wide, 100 across and 50 down the page, showing the
// default 1000x1000 virtual canvas - so a client coordinate maps to a turtle
// one as `(client - offset) * 2`, and a test that got the rect wrong could not
// pass by accident.
const RECT = {
  left: 100,
  top: 50,
  width: 500,
  height: 500,
  right: 600,
  bottom: 550,
  x: 100,
  y: 50,
  toJSON: () => "",
} as DOMRect;

const virtual = (clientX: number, clientY: number): [number, number] => [
  (clientX - RECT.left) * 2,
  (clientY - RECT.top) * 2,
];

let canvas: HTMLCanvasElement;
let detach: () => void;

/** Writes each query slot's value out, comma-separated, for `queried()` to read back. */
const report = (...indices: number[]): number[][] =>
  indices.flatMap((index, position) => [
    ...(position === 0 ? [] : [[PCode.lstr, 1, 44], [PCode.writ]]),
    // STAT's query lookup is `push(query[-n1])` for -11 <= n1 < 0
    [PCode.ldin, -index],
    [PCode.stat],
    [PCode.itos],
    [PCode.writ],
  ]);

/** The same, for one of the 256 key-state slots, which STAT reads by key code. */
const reportKey = (keyCode: number): number[][] => [
  [PCode.ldin, keyCode],
  [PCode.stat],
  [PCode.itos],
  [PCode.writ],
];

/**
 * Starts a program that pauses immediately, and hands back the two things a
 * test then needs: somewhere to send the events, and `queried()` to resume the
 * program and read what it reports.
 */
const paused = (
  reporting: number[][],
): { flush: () => void; queried: () => string[] } => {
  const timers = fakeTimers();
  const output = fakeOutput();
  coreMachine.run(
    [[PCode.ldin, 0], [PCode.wait], ...reporting, [PCode.halt]],
    coreMachine.defaultMachineOptions,
    timers,
    output,
    fakeCanvas(),
    fakeFiles(),
  );
  return {
    flush: () => timers.flush(),
    queried: () => {
      timers.flush();
      return output.outputText.split(",");
    },
  };
};

beforeEach(() => {
  canvas = document.createElement("canvas");
  canvas.getBoundingClientRect = () => RECT;
  detach = attachInput(canvas);
});

afterEach(() => {
  detach();
  coreMachine.halt();
  assertNoWombleLogs();
});

describe("the keyboard", () => {
  // query[9] is the raw key code, query[10] the key code's flags (128, plus a
  // bit per modifier), and the key's own slot holds the same flags.
  it("reports a keystroke's code, flags and key state", () => {
    const run = paused([...report(9, 10), ...reportKey(65)]);
    dispatchEvent(keyEvent("keydown", "a", 65));
    assertEquals(run.queried(), ["65", "128128"]);
  });

  it("adds 8 for shift, 16 for alt and 32 for ctrl", () => {
    const run = paused(report(10));
    dispatchEvent(
      keyEvent("keydown", "A", 65, {
        shiftKey: true,
        altKey: true,
        ctrlKey: true,
      }),
    );
    assertEquals(run.queried(), ["184"]);
  });

  // Releasing a key negates the same three values rather than clearing them,
  // so a program can tell "not pressed" from "never pressed".
  it("negates the key state on release", () => {
    const run = paused([...report(9, 10), ...reportKey(65)]);
    dispatchEvent(keyEvent("keydown", "a", 65));
    dispatchEvent(keyEvent("keyup", "a", 65));
    assertEquals(run.queried(), ["-65", "-128-128"]);
  });

  // Otherwise every keystroke in the code editor would also be typed at the
  // running program.
  it("ignores keys typed into an editable element", () => {
    const contentEditable = document.createElement("div");
    // jsdom leaves `isContentEditable` undefined, so the element that stands
    // for a rich-text field has to say so itself
    Object.defineProperty(contentEditable, "isContentEditable", {
      value: true,
    });
    for (const target of [
      document.createElement("textarea"),
      document.createElement("input"),
      contentEditable,
    ]) {
      const run = paused(report(9));
      dispatchEvent(keyEvent("keydown", "a", 65, { target }));
      dispatchEvent(keyEvent("keyup", "a", 65, { target }));
      // -1 is what `memory.init` fills the query array with, i.e. untouched
      assertEquals(run.queried(), ["-1"]);
      coreMachine.halt();
    }
  });

  it("still reports a key typed at a plain element", () => {
    const run = paused(report(9));
    dispatchEvent(
      keyEvent("keydown", "a", 65, { target: document.createElement("div") }),
    );
    assertEquals(run.queried(), ["65"]);
  });

  // Backspace would go back a page and the arrow keys would scroll, both of
  // which a program reading the keyboard has to be able to prevent.
  it("stops the browser acting on backspace and the arrow keys", () => {
    for (const key of [
      "Backspace",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ]) {
      const event = keyEvent("keydown", key, 8);
      dispatchEvent(event);
      assert(event.defaultPrevented, `${key} should be prevented`);
    }
  });

  it("leaves an ordinary key to the browser", () => {
    const event = keyEvent("keydown", "a", 65);
    dispatchEvent(event);
    assertFalse(event.defaultPrevented);
  });
});

describe("the mouse", () => {
  // query[7] and query[8] are the live pointer position, in turtle
  // coordinates worked out from the canvas's own rectangle.
  it("reports the pointer position in the virtual canvas's coordinates", () => {
    const run = paused(report(7, 8));
    canvas.dispatchEvent(
      mouseEvent("mousemove", { clientX: 350, clientY: 150 }),
    );
    assertEquals(run.queried(), virtual(350, 150).map(String));
  });

  // query[4] is the last click's flags, query[1]-[3] the per-button ones,
  // query[5]/[6] where it happened and query[11] which button it was.
  it("reports a left click, its position and its button", () => {
    const run = paused(report(4, 1, 5, 6, 11));
    canvas.dispatchEvent(
      mouseEvent("mousedown", { clientX: 350, clientY: 150, button: 0 }),
    );
    const [x, y] = virtual(350, 150);
    assertEquals(run.queried(), ["129", "129", `${x}`, `${y}`, "1"]);
  });

  it("distinguishes the middle and right buttons", () => {
    const middle = paused(report(4, 3, 11));
    canvas.dispatchEvent(mouseEvent("mousedown", { button: 1 }));
    assertEquals(middle.queried(), ["132", "132", "3"]);
    coreMachine.halt();

    const right = paused(report(4, 2, 11));
    canvas.dispatchEvent(mouseEvent("mousedown", { button: 2 }));
    assertEquals(right.queried(), ["130", "130", "2"]);
  });

  it("carries the modifier keys held during the click", () => {
    const run = paused(report(4));
    canvas.dispatchEvent(
      mouseEvent("mousedown", {
        button: 0,
        shiftKey: true,
        altKey: true,
        ctrlKey: true,
      }),
    );
    assertEquals(run.queried(), ["185"]);
  });

  it("negates the click state on release", () => {
    const run = paused(report(4, 1));
    canvas.dispatchEvent(mouseEvent("mousedown", { button: 0 }));
    canvas.dispatchEvent(mouseEvent("mouseup", { button: 0 }));
    assertEquals(run.queried(), ["-129", "-129"]);
  });

  // A program that uses the right button needs the click, not the menu.
  it("suppresses the context menu", () => {
    const event = mouseEvent("contextmenu");
    canvas.dispatchEvent(event);
    assert(event.defaultPrevented);
  });

  // The default would be to select the canvas and whatever is around it.
  it("stops the browser acting on a press", () => {
    const event = mouseEvent("mousedown", { button: 0 });
    canvas.dispatchEvent(event);
    assert(event.defaultPrevented);
  });
});

describe("touch", () => {
  // A touch is a move to the point plus a left click there, so a program
  // written for the mouse works under a finger without knowing.
  it("starts as a move and a left button press at the same point", () => {
    const run = paused(report(7, 8, 5, 6, 4, 11));
    canvas.dispatchEvent(
      touchEvent("touchstart", [{ clientX: 350, clientY: 150 }]),
    );
    const [x, y] = virtual(350, 150);
    assertEquals(run.queried(), [`${x}`, `${y}`, `${x}`, `${y}`, "129", "1"]);
  });

  it("carries the modifiers held during a touch", () => {
    const run = paused(report(4));
    canvas.dispatchEvent(
      touchEvent("touchstart", [{ clientX: 200, clientY: 100 }], {
        shiftKey: true,
      }),
    );
    assertEquals(run.queried(), ["137"]);
  });

  it("moves the pointer, and stops the page scrolling under the finger", () => {
    const run = paused(report(7, 8));
    const event = touchEvent("touchmove", [{ clientX: 600, clientY: 550 }]);
    canvas.dispatchEvent(event);
    assert(event.defaultPrevented);
    assertEquals(run.queried(), virtual(600, 550).map(String));
  });

  it("ends as a left button release", () => {
    const run = paused(report(4, 1));
    canvas.dispatchEvent(
      touchEvent("touchstart", [{ clientX: 200, clientY: 100 }]),
    );
    canvas.dispatchEvent(touchEvent("touchend", []));
    assertEquals(run.queried(), ["-129", "-129"]);
  });

  // `touches` is what is *still* down, so a lifted finger arrives empty.
  it("does nothing with a touch event carrying no touches", () => {
    const run = paused(report(7, 5));
    canvas.dispatchEvent(touchEvent("touchstart", []));
    canvas.dispatchEvent(touchEvent("touchmove", []));
    assertEquals(run.queried(), ["-1", "-1"]);
  });
});

describe("detaching", () => {
  // `attachInput` returns its own cleanup so the caller can be an ordinary
  // Womble effect - `<canvas-tab>`'s, which runs it when the pane unmounts.
  it("stops feeding the machine anything", () => {
    detach();
    const run = paused(report(7, 9));
    canvas.dispatchEvent(
      mouseEvent("mousemove", { clientX: 350, clientY: 150 }),
    );
    dispatchEvent(keyEvent("keydown", "a", 65));
    assertEquals(run.queried(), ["-1", "-1"]);
    // afterEach detaches too, which must also be harmless
    detach = () => {};
  });

  // The guard behind every mouse handler: a page with no canvas on it (the
  // pane isn't showing) still has this module attached, and a stale element
  // that never had its listeners removed must not report positions from a
  // canvas the machine isn't drawing on.
  it("ignores pointer events from an element that is no longer the canvas", () => {
    attachInput(null);
    const run = paused(report(7, 5));
    canvas.dispatchEvent(
      mouseEvent("mousemove", { clientX: 350, clientY: 150 }),
    );
    canvas.dispatchEvent(mouseEvent("mousedown", { button: 0 }));
    canvas.dispatchEvent(
      touchEvent("touchstart", [{ clientX: 350, clientY: 150 }]),
    );
    canvas.dispatchEvent(
      touchEvent("touchmove", [{ clientX: 350, clientY: 150 }]),
    );
    assertEquals(run.queried(), ["-1", "-1"]);
  });
});
