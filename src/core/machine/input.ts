import { ports, state, vcanvas } from "./state.ts";
import * as memory from "./memory.ts";
import { virtx, virty } from "./vcanvas.ts";
import { execute } from "./runtime.ts";

export const updateKeyDown = (
  keyCode: number,
  key: string,
  shift: boolean,
  alt: boolean,
  ctrl: boolean,
): void => {
  if (!state.running) return;

  if (key === "Backspace") {
    const buffer = memory.main[1];
    if (buffer > 0) {
      if (memory.main[buffer + 1] !== memory.main[buffer + 2]) {
        if (memory.main[buffer + 2] === buffer + 3) {
          memory.main[buffer + 2] = memory.main[buffer]; // go "back" to the end
        } else {
          memory.main[buffer + 2] -= 1; // go back one
        }
        if (state.keyecho) {
          ports.output.backspaceConsole();
        }
      }
      if (memory.main[buffer + 2] >= memory.main[buffer + 1]) {
        memory.keys[0] = memory.main[buffer + 2] - memory.main[buffer + 1];
      } else {
        memory.keys[0] =
          memory.main[buffer + 2] -
          memory.main[buffer + 1] +
          memory.main[buffer] -
          buffer -
          2;
      }
    }
  }

  memory.query[9] = keyCode;
  memory.query[10] = 128;
  memory.query[11] = keyCode;
  if (shift) {
    memory.query[10] += 8;
  }
  if (alt) {
    memory.query[10] += 16;
  }
  if (ctrl) {
    memory.query[10] += 32;
  }
  memory.keys[keyCode] = memory.query[10];

  if (key === "Enter") {
    const buffer = memory.main[1];
    if (buffer > 0) {
      let next = 0;
      if (memory.main[buffer + 2] === memory.main[buffer]) {
        next = buffer + 3; // loop back round to the start
      } else {
        next = memory.main[buffer + 2] + 1;
      }
      if (next !== memory.main[buffer + 1]) {
        memory.main[memory.main[buffer + 2]] = 13; // Enter is character code 13
        memory.main[buffer + 2] = next;
        if (memory.main[buffer + 2] >= memory.main[buffer + 1]) {
          memory.keys[0] = memory.main[buffer + 2] - memory.main[buffer + 1];
        } else {
          memory.keys[0] =
            memory.main[buffer + 2] -
            memory.main[buffer + 1] +
            memory.main[buffer] -
            buffer -
            2;
        }
        // the visible counterpart of the CR just buffered: without it, anything
        // written after a readln continues the line the user typed on
        if (state.keyecho) {
          ports.output.logToConsole("\n");
        }
      }
    }
  } // add character to keybuffer if it's a printable character
  else if (key.length === 1 && !ctrl && !alt) {
    const charCode = key.charCodeAt(0);
    const buffer = memory.main[1];
    if (buffer > 0) {
      let next = 0;
      if (memory.main[buffer + 2] === memory.main[buffer]) {
        next = buffer + 3; // loop back round to the start
      } else {
        next = memory.main[buffer + 2] + 1;
      }
      if (next !== memory.main[buffer + 1]) {
        memory.main[memory.main[buffer + 2]] = charCode;
        memory.main[buffer + 2] = next;
        if (memory.main[buffer + 2] >= memory.main[buffer + 1]) {
          memory.keys[0] = memory.main[buffer + 2] - memory.main[buffer + 1];
        } else {
          memory.keys[0] =
            memory.main[buffer + 2] -
            memory.main[buffer + 1] +
            memory.main[buffer] -
            buffer -
            2;
        }
        if (state.keyecho) {
          ports.output.logToConsole(key);
        }
      }
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
  memory.query[9] = -Math.abs(memory.query[9]);
  memory.query[10] = -Math.abs(memory.query[10]);
  memory.keys[keyCode] = -Math.abs(memory.keys[keyCode]);

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

  memory.query[7] = virtx(canvasLeft, canvasWidth, vcanvas, clientX);
  memory.query[8] = virty(canvasTop, canvasHeight, vcanvas, clientY);

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
  memory.query[4] = 128;
  if (shift) {
    memory.query[4] += 8;
  }
  if (alt) {
    memory.query[4] += 16;
  }
  if (ctrl) {
    memory.query[4] += 32;
  }
  if (now - state.lastClickTime < 300) {
    memory.query[4] += 64; // double-click
  }
  state.lastClickTime = now; // save to check for the next double-click

  memory.query[5] = virtx(canvasLeft, canvasWidth, vcanvas, clientX);
  memory.query[6] = virty(canvasTop, canvasHeight, vcanvas, clientY);

  switch (button) {
    case 0: // left button
      memory.query[4] += 1;
      memory.query[1] = memory.query[4];
      memory.query[2] = -1;
      memory.query[3] = -1;
      memory.query[11] = 1; // 1 for lmouse
      break;

    case 1: // middle button
      memory.query[4] += 4;
      memory.query[1] = -1;
      memory.query[2] = -1;
      memory.query[3] = memory.query[4];
      memory.query[11] = 3; // 3 for mmouse
      break;

    case 2: // right button
      memory.query[4] += 2;
      memory.query[1] = -1;
      memory.query[2] = memory.query[4];
      memory.query[3] = -1;
      memory.query[11] = 2; // 2 for rmouse
      break;
  }

  if (state.detectActive) {
    checkDetectMouse(button);
  }
};

export const updateMouseUp = (button: number): void => {
  if (!state.running) return;

  memory.query[4] = -memory.query[4];
  switch (button) {
    case 0: // left button
      memory.query[1] = -memory.query[1];
      break;

    case 1: // middle button
      memory.query[3] = -memory.query[3];
      break;

    case 2: // right button
      memory.query[2] = -memory.query[2];
      break;
  }

  if (state.detectActive) {
    checkDetectMouse(button);
  }
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
    const returnValue =
      state.detectInputcode < 0
        ? memory.query[-state.detectInputcode]
        : memory.keys[state.detectInputcode];
    memory.stack.pop();
    // the keyup/mouseup listener that negates the input has already run, so the
    // value is negative; the downloadable system reports it positive
    memory.stack.push(Math.abs(returnValue));
    ports.timers.cancelCallback(state.detectTimeoutID);
    state.detectActive = false; // reset detect state
    execute();
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
    // deno-coverage-ignore-start -- the keys[] arm is unreachable here: every
    // condition that sets rightThingPressed above requires a *negative*
    // detectInputcode (unlike checkDetectKey's, where a positive keyCode can
    // match); the ternary just stays parallel with checkDetectKey's
    const returnValue =
      state.detectInputcode < 0
        ? memory.query[-state.detectInputcode]
        : memory.keys[state.detectInputcode];
    // deno-coverage-ignore-stop
    memory.stack.pop();
    // the keyup/mouseup listener that negates the input has already run, so the
    // value is negative; the downloadable system reports it positive
    memory.stack.push(Math.abs(returnValue));
    ports.timers.cancelCallback(state.detectTimeoutID);
    state.detectActive = false; // reset detect state
    execute();
  }
};

/** unlike every other detectable input, a mouse-position code (mousex/mousey/clickx/clicky) resolves on any movement, not just a click */
const checkDetectMouseMove = (): void => {
  if (state.detectInputcode < -8 || state.detectInputcode > -5) return;

  const returnValue = memory.query[-state.detectInputcode];
  memory.stack.pop();
  memory.stack.push(returnValue);
  ports.timers.cancelCallback(state.detectTimeoutID);
  state.detectActive = false; // reset detect state
  execute();
};

const handleReadline = (): void => {
  const bufferAddress = memory.main[1];
  const bufferEndAddress = memory.main[memory.main[1]];
  let string = "";
  let readNextAddress = memory.main[bufferAddress + 1];
  const readLastAddress = memory.main[bufferAddress + 2];
  while (
    readNextAddress !== readLastAddress &&
    memory.main[readNextAddress] !== 13
  ) {
    string += String.fromCharCode(memory.main[readNextAddress]);
    readNextAddress =
      readNextAddress < bufferEndAddress
        ? readNextAddress + 1
        : bufferAddress + 3; // loop back to the start
  }
  memory.main[bufferAddress + 1] =
    readNextAddress < bufferEndAddress
      ? readNextAddress + 1
      : bufferAddress + 3; // loop back to the start
  memory.makeHeapString(string);
  ports.timers.cancelCallback(state.readlineTimeoutID);
  state.readlineTimeoutID = 0; // reset readline state
  execute();
};
