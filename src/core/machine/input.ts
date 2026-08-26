import { ports, state, vcanvas } from "./state.ts";
import * as keybuffer from "./keybuffer.ts";
import * as memory from "./memory.ts";
import { virtx, virty } from "./vcanvas.ts";
import { execute } from "./runtime.ts";

/**
 * `memory.query` is indexed by the negated input code a program uses (see
 * `constants/inputs.ts`), so `?mousex` (-7) is `query[7]`. Naming them here
 * keeps this file's raw subscripts readable; `runtime.ts`'s STAT and ICLR still
 * index the array by the code they were handed, which is the same protocol seen
 * from the other end.
 */
const QUERY_LMOUSE = 1;
const QUERY_RMOUSE = 2;
const QUERY_MMOUSE = 3;
const QUERY_CLICK = 4;
const QUERY_CLICKX = 5;
const QUERY_CLICKY = 6;
const QUERY_MOUSEX = 7;
const QUERY_MOUSEY = 8;
const QUERY_KEY = 9;
const QUERY_KSHIFT = 10;
const QUERY_MOUSEKEY = 11;

/**
 * The modifier and button bits of a `?click`/`?kshift` value. Bit 7 is always
 * set, so that a genuine "nothing held" click is still a non-zero value and can
 * be told from an unset -1; the button bits are what `?lmouse` and friends
 * report back.
 */
const INPUT_PRESSED = 128;
const INPUT_SHIFT = 8;
const INPUT_ALT = 16;
const INPUT_CTRL = 32;
const INPUT_DOUBLE_CLICK = 64;
const INPUT_LEFT_BUTTON = 1;
const INPUT_RIGHT_BUTTON = 2;
const INPUT_MIDDLE_BUTTON = 4;

/** how close together two clicks must be to count as a double-click */
const DOUBLE_CLICK_MILLISECONDS = 300;

/** the `?mousekey` value each mouse button reports */
const MOUSEKEY_LMOUSE = 1;
const MOUSEKEY_RMOUSE = 2;
const MOUSEKEY_MMOUSE = 3;

export const updateKeyDown = (
  keyCode: number,
  key: string,
  shift: boolean,
  alt: boolean,
  ctrl: boolean,
): void => {
  if (!state.running) return;

  if (key === "Backspace") {
    if (keybuffer.backspace() && state.keyecho) {
      ports.output.backspaceConsole();
    }
  }

  memory.query[QUERY_KEY] = keyCode;
  memory.query[QUERY_KSHIFT] = INPUT_PRESSED;
  memory.query[QUERY_MOUSEKEY] = keyCode;
  if (shift) {
    memory.query[QUERY_KSHIFT] += INPUT_SHIFT;
  }
  if (alt) {
    memory.query[QUERY_KSHIFT] += INPUT_ALT;
  }
  if (ctrl) {
    memory.query[QUERY_KSHIFT] += INPUT_CTRL;
  }
  memory.keys[keyCode] = memory.query[QUERY_KSHIFT];

  if (key === "Enter") {
    if (keybuffer.push(keybuffer.CARRIAGE_RETURN) && state.keyecho) {
      // the visible counterpart of the CR just buffered: without it, anything
      // written after a readln continues the line the user typed on
      ports.output.logToConsole("\n");
    }
  } // add character to keybuffer if it's a printable character
  else if (key.length === 1 && !ctrl && !alt) {
    if (keybuffer.push(key.charCodeAt(0)) && state.keyecho) {
      ports.output.logToConsole(key);
    }

    if (state.detectActive && state.detectInputcode === 0) {
      checkDetectKey(0);
    }
  }

  if (state.detectActive) {
    checkDetectKey(keyCode);
  }
};

export const updateKeyUp = (keyCode: number, key: string): void => {
  if (!state.running) return;

  // Math.abs guards against two keydown events firing before the first keyup,
  // which would otherwise flip the value back to positive
  memory.query[QUERY_KEY] = -Math.abs(memory.readQuery(QUERY_KEY));
  memory.query[QUERY_KSHIFT] = -Math.abs(memory.readQuery(QUERY_KSHIFT));
  memory.keys[keyCode] = -Math.abs(memory.readKey(keyCode));

  if (state.readlineTimeoutID !== 0 && key === "Enter") {
    handleReadline();
  }

  if (state.detectActive) {
    checkDetectKey(keyCode);
  }
};

export const updateMouseMove = (
  clientX: number,
  clientY: number,
  canvasLeft: number,
  canvasTop: number,
  canvasWidth: number,
  canvasHeight: number,
): void => {
  if (!state.running) return;

  memory.query[QUERY_MOUSEX] = virtx(canvasLeft, canvasWidth, vcanvas, clientX);
  memory.query[QUERY_MOUSEY] = virty(canvasTop, canvasHeight, vcanvas, clientY);

  if (state.detectActive) {
    checkDetectMouseMove();
  }
};

export const updateMouseDown = (
  button: number,
  clientX: number,
  clientY: number,
  canvasLeft: number,
  canvasTop: number,
  canvasWidth: number,
  canvasHeight: number,
  shift: boolean,
  alt: boolean,
  ctrl: boolean,
): void => {
  if (!state.running) return;

  const now = ports.timers.now();
  memory.query[QUERY_CLICK] = INPUT_PRESSED;
  if (shift) {
    memory.query[QUERY_CLICK] += INPUT_SHIFT;
  }
  if (alt) {
    memory.query[QUERY_CLICK] += INPUT_ALT;
  }
  if (ctrl) {
    memory.query[QUERY_CLICK] += INPUT_CTRL;
  }
  if (now - state.lastClickTime < DOUBLE_CLICK_MILLISECONDS) {
    memory.query[QUERY_CLICK] += INPUT_DOUBLE_CLICK;
  }
  state.lastClickTime = now; // save to check for the next double-click

  memory.query[QUERY_CLICKX] = virtx(canvasLeft, canvasWidth, vcanvas, clientX);
  memory.query[QUERY_CLICKY] = virty(canvasTop, canvasHeight, vcanvas, clientY);

  switch (button) {
    case 0: // left button
      memory.query[QUERY_CLICK] += INPUT_LEFT_BUTTON;
      memory.query[QUERY_LMOUSE] = memory.query[QUERY_CLICK];
      memory.query[QUERY_RMOUSE] = -1;
      memory.query[QUERY_MMOUSE] = -1;
      memory.query[QUERY_MOUSEKEY] = MOUSEKEY_LMOUSE;
      break;

    case 1: // middle button
      memory.query[QUERY_CLICK] += INPUT_MIDDLE_BUTTON;
      memory.query[QUERY_LMOUSE] = -1;
      memory.query[QUERY_RMOUSE] = -1;
      memory.query[QUERY_MMOUSE] = memory.query[QUERY_CLICK];
      memory.query[QUERY_MOUSEKEY] = MOUSEKEY_MMOUSE;
      break;

    case 2: // right button
      memory.query[QUERY_CLICK] += INPUT_RIGHT_BUTTON;
      memory.query[QUERY_LMOUSE] = -1;
      memory.query[QUERY_RMOUSE] = memory.query[QUERY_CLICK];
      memory.query[QUERY_MMOUSE] = -1;
      memory.query[QUERY_MOUSEKEY] = MOUSEKEY_RMOUSE;
      break;
  }

  if (state.detectActive) {
    checkDetectMouse(button);
  }
};

export const updateMouseUp = (button: number): void => {
  if (!state.running) return;

  memory.query[QUERY_CLICK] = -memory.readQuery(QUERY_CLICK);
  switch (button) {
    case 0: // left button
      memory.query[QUERY_LMOUSE] = -memory.readQuery(QUERY_LMOUSE);
      break;

    case 1: // middle button
      memory.query[QUERY_MMOUSE] = -memory.readQuery(QUERY_MMOUSE);
      break;

    case 2: // right button
      memory.query[QUERY_RMOUSE] = -memory.readQuery(QUERY_RMOUSE);
      break;
  }

  if (state.detectActive) {
    checkDetectMouse(button);
  }
};

/**
 * The shared tail of checkDetectKey and checkDetectMouse: replaces the 0 that
 * TDET pushed with the detected value, cancels the timeout, and resumes.
 */
const resolveDetect = (returnValue: number): void => {
  memory.stack.pop();
  // the keyup/mouseup listener that negates the input has already run, so the
  // value is negative; the downloadable system reports it positive
  memory.stack.push(Math.abs(returnValue));
  ports.timers.cancelCallback(state.detectTimeoutID);
  state.detectActive = false; // reset detect state
  execute();
};

const checkDetectKey = (keyCode: number): void => {
  let rightThingPressed = false;

  // -11 is \mousekey - returns whatever was clicked/pressed
  if (state.detectInputcode === -11) rightThingPressed = true;
  // -10 and -9 return for any key (not for mouse)
  if (state.detectInputcode === -9 || state.detectInputcode === -10) {
    rightThingPressed = true;
  }
  // 0 is the keybuffer
  if (state.detectInputcode === 0) rightThingPressed = true;
  if (keyCode === state.detectInputcode) rightThingPressed = true;

  if (rightThingPressed) {
    resolveDetect(
      state.detectInputcode < 0
        ? memory.readQuery(-state.detectInputcode)
        : memory.readKey(state.detectInputcode),
    );
  }
};

const checkDetectMouse = (button: number): void => {
  let rightThingPressed = false;

  // -11 is \mousekey - returns whatever was clicked/pressed
  if (state.detectInputcode === -11) rightThingPressed = true;
  // -8 to -4 - returns for any mouse click
  if (-8 <= state.detectInputcode && state.detectInputcode <= -4) {
    rightThingPressed = true;
  }
  if (state.detectInputcode === -3 && button == 1) rightThingPressed = true;
  if (state.detectInputcode === -2 && button == 2) rightThingPressed = true;
  if (state.detectInputcode === -1 && button == 0) rightThingPressed = true;

  if (rightThingPressed) {
    // every condition that sets rightThingPressed above requires a *negative*
    // detectInputcode, unlike checkDetectKey's, so query is the only array
    // that can be read here
    resolveDetect(memory.readQuery(-state.detectInputcode));
  }
};

/** unlike every other detectable input, a mouse-position code (mousex/mousey/clickx/clicky) resolves on any movement, not just a click */
const checkDetectMouseMove = (): void => {
  if (state.detectInputcode < -8 || state.detectInputcode > -5) return;

  // deliberately not Math.abs'd, unlike resolveDetect: a coordinate is a
  // position, not a pressed/released flag, and may legitimately be negative
  const returnValue = memory.readQuery(-state.detectInputcode);
  memory.stack.pop();
  memory.stack.push(returnValue);
  ports.timers.cancelCallback(state.detectTimeoutID);
  state.detectActive = false; // reset detect state
  execute();
};

const handleReadline = (): void => {
  memory.makeHeapString(keybuffer.readLine());
  ports.timers.cancelCallback(state.readlineTimeoutID);
  state.readlineTimeoutID = 0; // reset readline state
  execute();
};
