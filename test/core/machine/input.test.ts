import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  defaultMachineOptions,
  run,
  updateKeyDown,
  updateKeyUp,
  updateMouseDown,
  updateMouseMove,
  updateMouseUp,
} from "@/core/machine.ts";
import { fakeCanvas, fakeFiles, fakeOutput, fakeTimers } from "./lib/fakes.ts";
import { PCode } from "./lib/helpers.ts";

/**
 * Coverage for `src/core/machine/input.ts`: the five `update*` functions
 * the UI calls to report keyboard/mouse events during a run.
 *
 * All five early-return if the machine isn't running, so every test here
 * gets it running first with a small hand-written pcode program that pauses
 * (via WAIT, or via TDET/RDLN) rather than halting immediately - the
 * `update*` call happens while paused, and the test observes its effect by
 * letting the paused program resume and read the result back (via STAT for
 * plain query/key state, since `memory.query`/`memory.keys` aren't exposed
 * by the barrel directly) through `output.outputText`.
 */
describe("machine/input", () => {
  /**
   * Starts a program paused on WAIT, ready for update* calls before resuming
   * it. `beforeWait` runs first, synchronously, during this same call (e.g.
   * allocating a keybuffer) - it must run before the pause, since update*
   * calls made before `beforeWait`'s effects exist (like a keybuffer address
   * stored at main[1]) are silently dropped.
   */
  const startPaused = (afterWait: number[][], beforeWait: number[][] = []) => {
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    run(
      [
        ...beforeWait,
        [PCode.ldin, 0],
        [PCode.wait],
        ...afterWait,
        [PCode.halt],
      ],
      defaultMachineOptions,
      timers,
      output,
      canvas,
      files,
    );
    return { timers, output, canvas };
  };

  /** STAT's query lookup is `push(query[-n1])` for -11 <= n1 < 0, so query index i is encoded as -i */
  const readQuery = (index: number): number[][] => [
    [PCode.ldin, -index],
    [PCode.stat],
    [PCode.itos],
    [PCode.writ],
  ];

  const readKey = (keyCode: number): number[][] => [
    [PCode.ldin, keyCode],
    [PCode.stat],
    [PCode.itos],
    [PCode.writ],
  ];

  describe("do nothing when the machine isn't running", () => {
    it("updateKeyDown/Up, updateMouseDown/Move/Up are all no-ops before any run()", () => {
      // no run() has happened in this test - state.running is false
      updateKeyDown(65, "a", false, false, false);
      updateKeyUp(65, "a");
      updateMouseDown(0, 10, 10, 0, 0, 100, 100, false, false, false);
      updateMouseMove(10, 10, 0, 0, 100, 100);
      updateMouseUp(0);
      // nothing to assert beyond "didn't throw" - see input.ts's early `if (!state.running) return;`
    });
  });

  describe("keyboard: query and keys state", () => {
    it("updateKeyDown records the key code and a modifier-encoded value", () => {
      const { timers, output } = startPaused(readKey(65));
      updateKeyDown(65, "a", false, false, false);
      timers.flush();
      assertEquals(output.outputText, "128"); // no modifiers: just the base 128 flag
    });

    it("updateKeyDown adds 8/16/32 for shift/alt/ctrl", () => {
      const { timers, output } = startPaused(readKey(65));
      updateKeyDown(65, "a", true, true, true);
      timers.flush();
      assertEquals(output.outputText, String(128 + 8 + 16 + 32));
    });

    it("updateKeyUp negates the recorded key value", () => {
      const { timers, output } = startPaused(readKey(65));
      updateKeyDown(65, "a", false, false, false);
      updateKeyUp(65, "a");
      timers.flush();
      assertEquals(output.outputText, "-128");
    });

    it("logs typed characters to the console when key echo is on (the default)", () => {
      // echoing (like buffering) only happens once a keybuffer exists (see
      // "the keybuffer" below) - allocate one before pausing
      const { output } = startPaused([], allocateBuffer(16));
      updateKeyDown(104, "h", false, false, false);
      assertEquals(output.consoleText, "h");
    });

    it("echoes Enter as a line break, so what follows a readln starts on a new line", () => {
      const { output } = startPaused([], allocateBuffer(16));
      updateKeyDown(104, "h", false, false, false);
      updateKeyDown(13, "Enter", false, false, false);
      assertEquals(output.consoleText, "h\n");
    });

    it("echoes nothing at all when KECH has turned key echo off", () => {
      const { output } = startPaused(
        [],
        [...allocateBuffer(16), [PCode.ldin, 0], [PCode.kech]],
      );
      updateKeyDown(104, "h", false, false, false);
      updateKeyDown(13, "Enter", false, false, false);
      assertEquals(output.consoleText, "");
    });
  });

  /** allocates a keybuffer of the given size, storing its address at main[1] per input.ts's convention */
  const allocateBuffer = (size: number): number[][] => [
    [PCode.ldin, size],
    [PCode.bufr],
    [PCode.stvg, 1],
  ];

  describe("keyboard: the keybuffer (BUFR + READ)", () => {
    it("buffers typed characters and READ reads them back", () => {
      const { timers, output } = startPaused(
        [[PCode.ldin, 10], [PCode.read], [PCode.writ]],
        allocateBuffer(16),
      );
      updateKeyDown(104, "h", false, false, false);
      updateKeyDown(105, "i", false, false, false);
      timers.flush();
      assertEquals(output.outputText, "hi");
    });

    it("READ(n) reads exactly n characters, leaving the rest in the buffer", () => {
      const { timers, output } = startPaused(
        [
          [PCode.ldin, 2],
          [PCode.read],
          [PCode.writ],
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 10],
          [PCode.read],
          [PCode.writ],
        ],
        allocateBuffer(16),
      );
      updateKeyDown(104, "h", false, false, false);
      updateKeyDown(105, "i", false, false, false);
      updateKeyDown(33, "!", false, false, false); // a 3rd character, available when READ(2) runs
      timers.runNext(); // resumes from the initial pause, runs up to the WAIT(0)
      assertEquals(output.outputText, "hi"); // not "hi!" - the "!" must be left for the next READ
      timers.flush();
      assertEquals(output.outputText, "hi!");
    });

    it("Backspace removes the last buffered character", () => {
      const { timers, output } = startPaused(
        [[PCode.ldin, 10], [PCode.read], [PCode.writ]],
        allocateBuffer(16),
      );
      updateKeyDown(104, "h", false, false, false);
      updateKeyDown(105, "i", false, false, false);
      updateKeyDown(8, "Backspace", false, false, false);
      timers.flush();
      assertEquals(output.outputText, "h");
    });

    it("Backspace also removes the echoed character from the console (when the buffer isn't empty)", () => {
      const { output } = startPaused([], allocateBuffer(16));
      updateKeyDown(104, "h", false, false, false);
      assertEquals(output.consoleText, "h");
      updateKeyDown(8, "Backspace", false, false, false);
      assertEquals(output.consoleText, "");
    });

    it("Backspace on an empty buffer doesn't touch the console", () => {
      const { output } = startPaused([], allocateBuffer(16));
      updateKeyDown(8, "Backspace", false, false, false);
      assertEquals(output.consoleText, "");
      assertFalse(output.calls.some((c) => c.method === "backspaceConsole"));
    });

    it("a full buffer drops further characters silently, keeping the earliest", () => {
      // 2 usable slots, backed by 3 physical cells: the third character finds
      // the write pointer's next position already at the read pointer, which
      // means full rather than empty, and is dropped
      const { timers, output } = startPaused(
        [[PCode.ldin, 10], [PCode.read], [PCode.writ]],
        allocateBuffer(2),
      );
      updateKeyDown(97, "a", false, false, false);
      updateKeyDown(98, "b", false, false, false);
      updateKeyDown(99, "c", false, false, false);
      timers.flush();
      assertEquals(output.outputText, "ab");
    });

    it("a dropped character isn't echoed to the console either", () => {
      const { output } = startPaused([], allocateBuffer(2));
      updateKeyDown(97, "a", false, false, false);
      updateKeyDown(98, "b", false, false, false);
      updateKeyDown(99, "c", false, false, false);
      assertEquals(output.consoleText, "ab");
    });

    it("Backspace before BUFR has allocated a buffer is a no-op", () => {
      // main[1] is still 0, so there is no buffer to un-buffer from - the
      // same guard the printable-character path takes
      const { output } = startPaused([]);
      updateKeyDown(8, "Backspace", false, false, false);
      assertEquals(output.consoleText, "");
      assertFalse(output.calls.some((c) => c.method === "backspaceConsole"));
    });

    it("Backspace wraps back to the physical end once the write pointer has wrapped to the start", () => {
      // same 2-slot wrap as "the ring buffer wraps around" below: after
      // typing 'a', reading it back, then typing 'b' and 'c', the write
      // pointer has wrapped exactly to the buffer's start address - the one
      // position where Backspace's own "am I at the start?" check is true,
      // so it has to wrap backwards to the physical end instead of just
      // decrementing
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          ...allocateBuffer(2),
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 1],
          [PCode.read],
          [PCode.drop],
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 0],
          [PCode.read],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(97, "a", false, false, false);
      timers.runNext();
      updateKeyDown(98, "b", false, false, false);
      updateKeyDown(99, "c", false, false, false); // write pointer wraps to the buffer's start
      updateKeyDown(8, "Backspace", false, false, false); // removes "c"
      assertEquals(output.consoleText, "ab"); // checked before the final READ echoes anything more
      timers.flush();
      assertEquals(output.outputText, "b"); // "c" was successfully removed from the buffer too
    });

    it("Backspace decrements normally (no wrap) once the buffer has room again", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          ...allocateBuffer(2),
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 2],
          [PCode.read],
          [PCode.drop],
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 0],
          [PCode.read],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(97, "a", false, false, false);
      updateKeyDown(98, "b", false, false, false);
      timers.runNext(); // reads both "a" and "b", emptying the buffer
      updateKeyDown(99, "c", false, false, false);
      updateKeyDown(100, "d", false, false, false);
      updateKeyDown(8, "Backspace", false, false, false); // removes "d"
      assertEquals(output.consoleText, "abc");
      timers.flush();
      assertEquals(output.outputText, "c"); // "d" was successfully removed from the buffer too
    });

    describe("the ring buffer wraps around once it's gone all the way around", () => {
      // a 2-slot buffer is backed by 3 physical ring cells (one extra cell
      // to distinguish "empty" from "full"): typing 3
      // characters with no read in between only keeps the last 2 - so this
      // reads one character back first (advancing the read pointer off the
      // buffer's start) before typing 2 more, which pushes the write
      // pointer around past the physical end and back to the start. A
      // later READ that spans that gap has to wrap its own read pointer
      // the same way.
      const setUpWrappedBuffer = (finalReadMax: number) => {
        const timers = fakeTimers();
        const output = fakeOutput();
        const canvas = fakeCanvas();
        const files = fakeFiles();
        run(
          [
            ...allocateBuffer(2),
            [PCode.ldin, 0],
            [PCode.wait],
            [PCode.ldin, 1],
            [PCode.read],
            [PCode.drop],
            [PCode.ldin, 0],
            [PCode.wait],
            [PCode.ldin, finalReadMax],
            [PCode.read],
            [PCode.writ],
            [PCode.halt],
          ],
          defaultMachineOptions,
          timers,
          output,
          canvas,
          files,
        );
        updateKeyDown(97, "a", false, false, false);
        timers.runNext(); // resolves the first WAIT: reads/drops "a", advancing the read pointer
        updateKeyDown(98, "b", false, false, false);
        updateKeyDown(99, "c", false, false, false); // wraps the write pointer past the buffer's start
        timers.flush(); // resolves the second WAIT: the final READ
        return output;
      };

      it("READ(0) (read everything) wraps its read pointer correctly", () => {
        assertEquals(setUpWrappedBuffer(0).outputText, "bc");
      });

      it("READ(n) (bounded) also wraps its read pointer correctly", () => {
        assertEquals(setUpWrappedBuffer(5).outputText, "bc");
      });
    });
  });

  describe("keyboard: RDLN waits for Enter, then resumes with the typed line", () => {
    it("resumes with everything typed before Enter", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 16],
          [PCode.bufr],
          [PCode.stvg, 1],
          [PCode.rdln],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(104, "h", false, false, false);
      updateKeyDown(105, "i", false, false, false);
      updateKeyDown(13, "Enter", false, false, false); // Enter also lands in the buffer itself
      updateKeyUp(13, "Enter"); // this is what actually triggers handleReadline()
      assertEquals(output.outputText, "hi");
      // handleReadline() resumes execution directly (not via a scheduled callback),
      // and the program halts on its own - nothing should be left pending
      assertEquals(timers.pendingCount(), 0);
    });

    it("Enter itself wraps the write pointer when it lands exactly at the buffer's physical end", () => {
      // same 2-slot setup as the Backspace-wrap test above: after typing
      // "a", reading it back, and typing "b", the write pointer sits
      // exactly at the buffer's physical end - so writing Enter itself
      // (not a plain character) is what has to wrap it back to the start
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          ...allocateBuffer(2),
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 1],
          [PCode.read],
          [PCode.drop],
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 0],
          [PCode.read],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(97, "a", false, false, false);
      timers.runNext();
      updateKeyDown(98, "b", false, false, false);
      updateKeyDown(13, "Enter", false, false, false); // written into the buffer, wrapping the write pointer
      timers.flush();
      // "b" then Enter's own character code (13, a carriage return)
      assertEquals(output.outputText, "b\r");
    });

    it("handleReadline wraps its own read pointer when the typed line's end sits past the buffer's physical end", () => {
      // same idea as "Enter itself wraps..." above, but this time it's
      // handleReadline's *own* read loop (not the write side) that has to
      // cross the physical end and back to the start while assembling the
      // typed line - since Enter landed exactly at the physical end here,
      // this hits handleReadline's post-loop wrap specifically
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          ...allocateBuffer(2),
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 1],
          [PCode.read],
          [PCode.drop],
          [PCode.rdln],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(97, "a", false, false, false);
      timers.runNext();
      updateKeyDown(98, "b", false, false, false);
      updateKeyDown(13, "Enter", false, false, false); // wraps the write pointer to the start
      updateKeyUp(13, "Enter"); // triggers handleReadline
      assertEquals(output.outputText, "b");
      assertEquals(timers.pendingCount(), 0);
    });

    it("handleReadline's own read loop wraps mid-line when the line spans the physical end", () => {
      // a bigger (4-slot) buffer: after consuming "a", filling all 4
      // remaining slots with "b","c","d","e" (wrapping the write pointer),
      // then freeing 2 of them back up (another READ) and typing Enter -
      // Enter lands at a *low* address, after the wrap, with "d" and "e"
      // sitting on the far side of the physical end - so reading the line
      // back has to cross that boundary mid-loop, not just at the end
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          ...allocateBuffer(4),
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 1],
          [PCode.read],
          [PCode.drop], // consume "a"
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 2],
          [PCode.read],
          [PCode.drop], // consume "b" and "c"
          [PCode.rdln],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(97, "a", false, false, false);
      timers.runNext();
      updateKeyDown(98, "b", false, false, false);
      updateKeyDown(99, "c", false, false, false);
      updateKeyDown(100, "d", false, false, false);
      updateKeyDown(101, "e", false, false, false); // fills to capacity, wrapping the write pointer
      timers.runNext();
      updateKeyDown(13, "Enter", false, false, false); // written at the now-wrapped (low) write position
      updateKeyUp(13, "Enter");
      assertEquals(output.outputText, "de");
    });
  });

  /**
   * Starts a program paused on TDET(code, 0) - see the "never flush before
   * the matching event" note on the first TDET test below for why this
   * never calls timers.flush() itself.
   */
  const runDetect = (code: number) => {
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    run(
      [
        [PCode.ldin, code],
        [PCode.ldin, 0],
        [PCode.tdet],
        [PCode.itos],
        [PCode.writ],
        [PCode.halt],
      ],
      defaultMachineOptions,
      timers,
      output,
      canvas,
      files,
    );
    return { timers, output, canvas };
  };

  describe("keyboard: TDET detects a matching key press", () => {
    it("resumes with the pressed key's encoded value once the matching key is pressed", () => {
      // TDET itself is the pausing instruction here (unlike the WAIT-based
      // tests above) - checkDetectKey resolves it by calling execute()
      // directly, synchronously, so this deliberately never calls
      // timers.flush(): doing so before the matching key arrives would fire
      // TDET's own "give up" timeout (scheduled for as long as possible,
      // but the fake timers don't respect real elapsed delay) and resolve
      // it with the unresolved placeholder value instead.
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 65], // the key code to detect
          [PCode.ldin, 0], // 0 = wait as long as necessary
          [PCode.tdet],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      // an unrelated key shouldn't resolve the detect
      updateKeyDown(70, "f", false, false, false);
      assertEquals(output.outputText, "");
      // the matching key does, synchronously
      updateKeyDown(65, "a", false, false, false);
      assertEquals(output.outputText, "128");
      assertEquals(timers.pendingCount(), 0); // the give-up timeout was cancelled
    });

    it("also works with an explicit (non-zero) timeout", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 65],
          [PCode.ldin, 5000], // an explicit 5-second timeout, rather than 0 ("as long as necessary")
          [PCode.tdet],
          [PCode.itos],
          [PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateKeyDown(65, "a", false, false, false);
      assertEquals(output.outputText, "128");
    });

    it("resolves on key release too, not just key press", () => {
      const { output } = runDetect(65);
      // no prior updateKeyDown for this code - simulates detecting a release
      // in isolation; keys[65] defaults to -1, so |keys[65]| is 1
      updateKeyUp(65, "a");
      assertEquals(output.outputText, "1");
    });

    it("-11 (\\mousekey) resolves for any key", () => {
      const { output } = runDetect(-11);
      updateKeyDown(65, "a", false, false, false);
      // detectInputcode < 0, so the return value comes from query[11]
      assertEquals(output.outputText, "65");
    });

    it("-9 and -10 also resolve for any key", () => {
      // -9 reads back query[9] (the raw key code); -10 reads back query[10]
      // (the modifier-encoded value) - they resolve the same detect
      // condition but via different query slots, per checkDetectKey
      const nine = runDetect(-9);
      updateKeyDown(65, "a", false, false, false);
      assertEquals(nine.output.outputText, "65");

      const ten = runDetect(-10);
      updateKeyDown(65, "a", false, false, false);
      assertEquals(ten.output.outputText, "128");
    });

    it("0 (the keybuffer) resolves for any typed character, not just via the fallback check", () => {
      const { output } = runDetect(0);
      updateKeyDown(104, "h", false, false, false);
      // keys[0] is untouched by a keydown with no keybuffer allocated, so
      // it's still -1 (memory.init's fill value) - abs(-1) is 1
      assertEquals(output.outputText, "1");
    });
  });

  describe("mouse: query state via updateMouseMove/Down/Up", () => {
    it("updateMouseMove records the virtual-canvas-mapped position", () => {
      const { timers, output } = startPaused([
        ...readQuery(7),
        ...readQuery(8),
      ]);
      // 1:1 mapping: default virtual canvas is 1000x1000 at (0,0), canvas is 1000x1000 at (0,0)
      updateMouseMove(250, 300, 0, 0, 1000, 1000);
      timers.flush();
      assertEquals(output.outputText, "250300");
    });

    it("updateMouseDown records button, position, and modifier flags", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.flush();
      assertEquals(output.outputText, "129"); // 128 (base) + 1 (left button)
    });

    it("updateMouseUp negates the recorded button flag", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      updateMouseUp(0);
      timers.flush();
      assertEquals(output.outputText, "-129");
    });

    it("updateMouseDown adds 8/16/32 for shift/alt/ctrl, same as keyboard", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, true, true, true);
      timers.flush();
      assertEquals(output.outputText, String(128 + 8 + 16 + 32 + 1));
    });

    it("updateMouseDown does not add 64 for the first click of a run", () => {
      // the double-click check compares against the time of the previous
      // click *in this run*; with no previous click there is nothing to be
      // within 300ms of, however near zero the clock happens to be
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false); // now() is still 0
      timers.flush();
      assertEquals(output.outputText, String(128 + 1)); // no 64
    });

    it("updateMouseDown adds 64 for a second click within 300ms of the last", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.advance(100);
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.flush();
      assertEquals(output.outputText, String(128 + 64 + 1));
    });

    it("updateMouseDown does not add 64 for a second click more than 300ms later", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.advance(400);
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.flush();
      assertEquals(output.outputText, String(128 + 1));
    });

    it("a key press between two clicks doesn't spoil the double-click", () => {
      // the click timestamp lives outside the query array, so neither
      // updateKeyDown's query[11] (the key code) nor updateMouseDown's own
      // query[11] (the button ID, for \mousekey detects) can clobber it
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(1), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.advance(100);
      updateKeyDown(65, "a", false, false, false);
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      timers.flush();
      assertEquals(output.outputText, String(128 + 64 + 1));
    });

    it("updateMouseDown/Up record the middle button", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(3), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(1, 250, 300, 0, 0, 1000, 1000, false, false, false);
      updateMouseUp(1);
      timers.flush();
      assertEquals(output.outputText, String(-(128 + 4)));
    });

    it("updateMouseDown/Up record the right button", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], ...readQuery(2), [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      updateMouseDown(2, 250, 300, 0, 0, 1000, 1000, false, false, false);
      updateMouseUp(2);
      timers.flush();
      assertEquals(output.outputText, String(-(128 + 2)));
    });
  });

  /** starts a program paused on TDET(code, 0), ready for updateMouseDown */
  const runMouseDetect = (code: number) => {
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    run(
      [
        [PCode.ldin, code],
        [PCode.ldin, 0],
        [PCode.tdet],
        [PCode.itos],
        [PCode.writ],
        [PCode.halt],
      ],
      defaultMachineOptions,
      timers,
      output,
      canvas,
      files,
    );
    return { timers, output, canvas };
  };

  describe("mouse: TDET detects a matching click", () => {
    it("resolves for the left mouse button when detecting -1 (\\lmouse)", () => {
      const { timers, output } = runMouseDetect(-1);
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      assertEquals(output.outputText, "129");
      assertEquals(timers.pendingCount(), 0);
    });

    it("-11 (the general \\mousekey) resolves for any button", () => {
      const { output } = runMouseDetect(-11);
      updateMouseDown(1, 250, 300, 0, 0, 1000, 1000, false, false, false); // middle button
      // detectInputcode < 0: the return value comes from query[11], which
      // updateMouseDown's middle-button branch sets to 3
      assertEquals(output.outputText, "3");
    });

    it("-8 to -4 resolve for any mouse click", () => {
      const { output } = runMouseDetect(-5);
      updateMouseDown(2, 250, 300, 0, 0, 1000, 1000, false, false, false); // right button
      // query[5] (index -(-5)) holds the virtual-canvas x coordinate
      assertEquals(output.outputText, "250");
    });

    it("-3 resolves specifically for the middle button", () => {
      const { timers, output } = runMouseDetect(-3);
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false); // left: shouldn't resolve
      assertEquals(output.outputText, "");
      timers.advance(400); // clear of the double-click window, so no 64 below
      updateMouseDown(1, 250, 300, 0, 0, 1000, 1000, false, false, false); // middle: resolves
      // query[3] (index -(-3)) holds the middle button's flag value: 128 + 4
      assertEquals(output.outputText, "132");
    });

    it("-2 resolves specifically for the right button", () => {
      const { timers, output } = runMouseDetect(-2);
      updateMouseDown(1, 250, 300, 0, 0, 1000, 1000, false, false, false); // middle: shouldn't resolve
      assertEquals(output.outputText, "");
      timers.advance(400); // clear of the double-click window, so no 64 below
      updateMouseDown(2, 250, 300, 0, 0, 1000, 1000, false, false, false); // right: resolves
      // query[2] (index -(-2)) holds the right button's flag value: 128 + 2
      assertEquals(output.outputText, "130");
    });

    it("also resolves on button release, not just press", () => {
      const { output } = runMouseDetect(-1);
      // no prior updateMouseDown - simulates detecting a release in
      // isolation, the same way the keyboard release test above does
      updateMouseUp(0);
      assertEquals(output.outputText, "1");
    });

    it("a keyboard detect (a non-negative inputcode) is never resolved by a mouse click", () => {
      // this is also why checkDetectMouse's keys[] ternary arm carries a
      // deno-coverage-ignore in src/core/machine/input.ts: every condition
      // that can resolve a detect from a mouse event requires a negative
      // detectInputcode, so the positive-code arm can never run there
      const { timers, output } = runMouseDetect(65); // "A"
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      updateMouseUp(0);
      assertEquals(output.outputText, ""); // still paused on the TDET
      assert(timers.pendingCount() > 0); // the detect timeout is still live
    });
  });

  describe("mouse: TDET on a mouse-position code resolves on movement alone", () => {
    // -8..-5 (\mousey, \mousex, \clicky, \clickx) are the odd ones out: the
    // original system resolves these on any mouse *movement*, with no click
    // at all, unlike every other detectable input. That's checkDetectMouseMove
    // in src/core/machine/input.ts, reached from updateMouseMove.

    it("-7 (\\mousex) resolves on a move, with no click, returning the mapped x", () => {
      const { output } = runMouseDetect(-7);
      assertEquals(output.outputText, ""); // nothing yet - no movement so far
      updateMouseMove(250, 300, 0, 0, 1000, 1000);
      // query[7] (index -(-7)) is the live pointer x, set by updateMouseMove
      assertEquals(output.outputText, "250");
    });

    it("-8 (\\mousey) likewise resolves on a move, returning the mapped y", () => {
      const { output } = runMouseDetect(-8);
      updateMouseMove(250, 300, 0, 0, 1000, 1000);
      // query[8] (index -(-8)) is the live pointer y
      assertEquals(output.outputText, "300");
    });

    it("-5 (\\clickx) resolves on a move too, but yields the last CLICK's x", () => {
      // the lower edge of the -8..-5 range. \clickx/\clicky are click
      // coordinates (query[5]/query[6], written by updateMouseDown), yet
      // they resolve on movement like the other two - so with no click
      // having happened the program resumes with the initial -1, rather
      // than the position just moved to. Pinning this deliberately: it is
      // the behaviour the original system has, and it is easy to "fix"
      // into a regression by narrowing the range check to -8..-7.
      const { output } = runMouseDetect(-5);
      updateMouseMove(250, 300, 0, 0, 1000, 1000);
      assertEquals(output.outputText, "-1");
    });

    it("a code outside -8..-5 is NOT resolved by movement alone", () => {
      // -1 (\lmouse) is a button detect: moving the mouse must leave the
      // program still waiting, or every mouse-button detect would resolve
      // itself the moment the pointer twitched
      const { output } = runMouseDetect(-1);
      updateMouseMove(250, 300, 0, 0, 1000, 1000);
      assertEquals(output.outputText, "");
      updateMouseDown(0, 250, 300, 0, 0, 1000, 1000, false, false, false);
      assertEquals(output.outputText, "129"); // the click still resolves it
    });
  });
});
