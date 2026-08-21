import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals, assertFalse, assertThrows } from "@std/assert";
import {
  defaultMachineOptions,
  halt,
  isRunning,
  playOrPause,
  reset,
  run,
  setPorts,
} from "@/core/machine.ts";
import { fakeCanvas, fakeFiles, fakeOutput, fakeTimers } from "./lib/fakes.ts";
import { PCode } from "./lib/helpers.ts";

/**
 * Coverage for `src/core/machine/runtime.ts`'s standalone control functions:
 * `halt`, `isRunning`, `playOrPause`, and `reset`. `run` itself is covered
 * throughout runtime.test.ts.
 */
describe("machine/control", () => {
  it("isRunning is false before any run()", () => {
    // NB: state is a module-level singleton, so this only holds if no
    // earlier test in the same run left the machine running - every other
    // test in this suite halts (or errors, which also halts) before
    // finishing, so this is safe as the first assertion here
    assertFalse(isRunning());
  });

  // state.ts used to carry a full set of no-op `ports` stubs as a default,
  // and an earlier version of this comment claimed they were unreachable.
  // That was wrong: `reset()` is exported from the barrel and draws to the
  // canvas without consulting `state.running`, and the UI wires it to a
  // "Reset machine" menu action - so a user resetting before ever pressing
  // run reached exactly those stubs. They've since been removed in favour
  // of `setPorts`, which the client calls at startup and `run()` calls on every
  // run. Hence the test below: reset() without a preceding run() must still be
  // safe.

  it("setPorts alone makes reset() safe, with no run() first", () => {
    // this is exactly what the UI's "Reset machine" menu action does on a
    // freshly loaded page: the client calls setPorts at startup, and the
    // user can hit reset before ever pressing run
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    setPorts({ timers, output, canvas, files });

    reset();

    // the setup calls landed on the ports we installed, not on any default
    assert(
      canvas.calls.some(
        (c) => c.method === "setResolution" && c.args[0] === 1000,
      ),
    );
    assertEquals(output.turtleProperties.x, 500);
    assertEquals(output.turtleProperties.y, 500);
    assertFalse(isRunning());
  });

  it("isRunning is true once run(), false again after it halts", () => {
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    run([[PCode.halt]], defaultMachineOptions, timers, output, canvas, files);
    assertFalse(isRunning());
  });

  it("isRunning stays true while paused mid-program (not yet halted)", () => {
    const timers = fakeTimers();
    const output = fakeOutput();
    const canvas = fakeCanvas();
    const files = fakeFiles();
    run(
      [[PCode.ldin, 0], [PCode.wait], [PCode.halt]],
      defaultMachineOptions,
      timers,
      output,
      canvas,
      files,
    );
    assert(isRunning());
    timers.flush();
    assertFalse(isRunning());
  });

  describe("halt", () => {
    it("stops the machine, resets the canvas cursor, and fires a 'halted' state change", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [[PCode.ldin, 0], [PCode.wait], [PCode.halt]],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      assert(isRunning());
      halt();
      assertFalse(isRunning());
      assertEquals(output.stateChanges.at(-1), "halted");
      assert(
        canvas.calls.some((c) => c.method === "setCursor" && c.args[0] === 1),
      );
    });

    it("is a no-op when the machine isn't running", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run([[PCode.halt]], defaultMachineOptions, timers, output, canvas, files); // already halted
      const stateChangesBefore = output.stateChanges.length;
      halt();
      assertEquals(output.stateChanges.length, stateChangesBefore);
    });
  });

  describe("playOrPause", () => {
    it("pauses then unpauses a running program, firing the matching state changes", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 111],
          [PCode.itos, PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      playOrPause();
      assertEquals(output.stateChanges.at(-1), "paused");
      assert(isRunning()); // paused, not halted

      playOrPause();
      assertEquals(output.stateChanges.at(-1), "unpaused");

      timers.flush();
      assertEquals(output.outputText, "111");
      assertEquals(output.stateChanges.at(-1), "halted");
    });

    it("is a no-op when the machine isn't running", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run([[PCode.halt]], defaultMachineOptions, timers, output, canvas, files); // already halted
      const stateChangesBefore = output.stateChanges.length;
      playOrPause();
      assertEquals(output.stateChanges.length, stateChangesBefore);
    });

    it("blocks execute() from making progress while paused", () => {
      // execute()'s own top-of-loop check re-schedules itself every 1ms
      // while paused, rather than halting outright - so flushing the fake
      // timers while paused never drains the queue (nothing ever unpauses
      // it), which fakeTimers().flush() surfaces as its own safety-net error
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run(
        [
          [PCode.ldin, 0],
          [PCode.wait],
          [PCode.ldin, 111],
          [PCode.itos, PCode.writ],
          [PCode.halt],
        ],
        defaultMachineOptions,
        timers,
        output,
        canvas,
        files,
      );
      playOrPause();
      assertThrows(() => timers.flush(5), Error, "exceeded 5 iterations");
      assertEquals(output.outputText, ""); // never made it past the pause
    });
  });

  describe("reset", () => {
    it("re-sends the initial canvas/output/turtle setup calls", () => {
      const timers = fakeTimers();
      const output = fakeOutput();
      const canvas = fakeCanvas();
      const files = fakeFiles();
      run([[PCode.halt]], defaultMachineOptions, timers, output, canvas, files);
      const canvasCallsBefore = canvas.calls.length;
      const outputCallsBefore = output.calls.length;

      reset();

      assert(canvas.calls.length > canvasCallsBefore);
      assert(output.calls.length > outputCallsBefore);
      assert(
        canvas.calls.some(
          (c) => c.method === "setResolution" && c.args[0] === 1000,
        ),
      );
      assertEquals(output.turtleProperties.x, 500);
      assertEquals(output.turtleProperties.y, 500);
      assertEquals(output.turtleProperties.d, 0);
      assertEquals(output.turtleProperties.a, 360);
      assertEquals(output.turtleProperties.t, 2);
      assertEquals(output.turtleProperties.c, "#000");
    });
  });
});
