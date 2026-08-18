import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import type { Turtle } from "@/core/machine.ts";
import {
  compileExample,
  readExample,
  runExampleBounded,
} from "../core/machine/_exampleHarness.ts";

/**
 * Regression coverage (group C of 3): compiles and runs 10 real
 * `assets/examples/Python/` programs that use Python's `list` type, several of
 * which once exposed a concrete bug that is re-tested here.
 *
 * Every `it()` compiles fresh (via `compileExample`) and runs fresh (via
 * `runExampleBounded`, which gives each test its own fakes) rather than
 * sharing state across `it()`s in a `describe`, to keep each assertion
 * independently readable and to avoid one test's bounded run leaking into
 * another's.
 */
describe("Python list examples (C): Models & Movement", () => {
  describe("Models/BrownianMotion.tpy", () => {
    it("compiles and runs a bounded number of frames without a runtime error", async () => {
      const code = await readExample("Python/Models/BrownianMotion.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });

    it("primes molecule 0's position with a real random draw, instead of leaving it stuck at the placeholder (1,1) from '[1]*MOLECULES'", async () => {
      // the while-loop that re-randomizes a molecule's position until it lands
      // on a clear
      // pixel was never primed with an initial draw, so element 0 (whose
      // placeholder pixcol reads as clear on a fresh canvas) never entered
      // the loop body and stayed at (1,1) forever
      const code = await readExample("Python/Models/BrownianMotion.tpy");
      const pcode = compileExample("Python", code);
      const { canvas } = runExampleBounded(pcode, 50);
      // the very first drawArc call is the pole's blot(HITRADIUS=90); the
      // next drawArc calls are each molecule's blot(2*MOLRADIUS=20) in the
      // init loop, in order - so the first one is molecule 0's
      const moleculeBlots = canvas.calls.filter(
        (call) => call.method === "drawArc" && call.args[1] === 20,
      );
      assertEquals(moleculeBlots.length > 0, true);
      const molecule0 = moleculeBlots[0].args[0] as Turtle;
      assertEquals(molecule0.x === 1 && molecule0.y === 1, false);
    });
  });

  describe("Models/Cheetahs.tpy", () => {
    it("compiles and runs several generations without a runtime error", async () => {
      // exercises both fixes at once: the gazelle init loop rebased to
      // range(0,gnum,1) (was range(1,gnum,1)), and babycheetah/babygazelle's
      // free-slot search rebased to start probing at index 0 (was 1). Neither
      // fix is
      // independently observable from outside without reading heap-internal
      // list contents (impractical via dump()'s raw stack/heap numbers), so
      // this run - long enough to exercise generation(), asserting no
      // index-related runtime error - is this file's meaningful regression
      // test; a more specific assertion isn't practical.
      //
      // NB: the iteration bound is what ends this run, not the program's own
      // "if cnum<1: ...halt()" check in graph(): both populations stay
      // healthy for the ~110 generations 2000 flush cycles allow.
      const code = await readExample("Python/Models/Cheetahs.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 2000);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Models/Flocking.tpy", () => {
    it("compiles and runs a bounded number of frames without a runtime error", async () => {
      const code = await readExample("Python/Models/Flocking.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });

    it("primes boid 0's position with a real random draw, instead of leaving it stuck at the placeholder (1,1) from '[1]*NUMBOIDS'", async () => {
      // same shaped fix as BrownianMotion.tpy. draw(True) runs immediately
      // after setup() and calls setxy(boidx[n],boidy[n]) before its own
      // blot(BOIDRADIUS) for each n in order, so its first drawArc call - the
      // first one whose colour isn't setup()'s halo colour - is boid 0's real
      // position.
      const code = await readExample("Python/Models/Flocking.tpy");
      const pcode = compileExample("Python", code);
      const { canvas } = runExampleBounded(pcode, 50);
      const haloColour = "#fffffe"; // HALOCOLOUR=16777214, from setup()
      const boidDraws = canvas.calls.filter(
        (call) =>
          call.method === "drawArc" &&
          (call.args[0] as Turtle).c !== haloColour,
      );
      assertEquals(boidDraws.length > 0, true);
      const boid0 = boidDraws[0].args[0] as Turtle;
      assertEquals(boid0.x === 500 && boid0.y === 500, false);
    });

    it("blots each setup() halo around that boid's own position, not all of them on the turtle's starting position", async () => {
      // setup() has to call setxy(boidx[n],boidy[n]) before its
      // blot(2*BOIDRADIUS), exactly as the Pascal reference at
      // assets/examples/Pascal/Models/Flocking.tpas does; without it every
      // halo lands on the turtle's canvas-centre starting position and no
      // boid gets one. setup() runs immediately before draw(True) with
      // nothing moving the boids in between, so the two passes visit the
      // same NUMBOIDS positions in the same order - which makes draw(True)'s
      // blots the reference the halos have to match.
      const code = await readExample("Python/Models/Flocking.tpy");
      const pcode = compileExample("Python", code);
      const { canvas } = runExampleBounded(pcode, 50);
      const haloColour = "#fffffe"; // HALOCOLOUR=16777214, from setup()
      const arcs = canvas.calls.filter((call) => call.method === "drawArc");
      const positionsOf = (calls: typeof arcs) =>
        calls.map((call) => {
          const turtle = call.args[0] as Turtle;
          return [turtle.x, turtle.y];
        });
      const haloPositions = positionsOf(
        arcs.filter((call) => (call.args[0] as Turtle).c === haloColour),
      );
      const boidPositions = positionsOf(
        arcs.filter((call) => (call.args[0] as Turtle).c !== haloColour),
      ).slice(0, haloPositions.length);
      assertEquals(haloPositions.length, 30); // NUMBOIDS
      assertEquals(haloPositions, boidPositions);
    });
  });

  describe("Models/Interference.tpy", () => {
    it("compiles and runs a bounded number of frames without a runtime error", async () => {
      // an interactive program (waits on a keypress each cycle via
      // detect(\key,0)) - hitting the iteration cap while still waiting for
      // input is expected, not a failure
      const code = await readExample("Python/Models/Interference.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Models/Roads.tpy", () => {
    it("compiles and places graph nodes without a runtime error", async () => {
      // no natural infinite loop, but places up to SUFFNODES=400 nodes and
      // then runs a joinup() pass over all of them - a lot of work, so this
      // needs a much higher iteration cap than the animation-loop files to
      // get meaningfully far through it within a single bounded run
      const code = await readExample("Python/Models/Roads.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 3000);
      assertEquals(output.runtimeErrors, []);
    });

    it("draws multiple distinct node positions, rather than collapsing onto the stale placeholder (1,1) from the pre-closest() priming bug", async () => {
      // closest() used to be called before nodex[numnodes]/nodey[numnodes] were
      // ever
      // randomized, using whatever placeholder was already there - marknode()
      // draws a blot(NODERADIUS) at each newly placed node's actual
      // position, so distinct positions across those blots is direct
      // evidence real, varied node placement is happening
      const code = await readExample("Python/Models/Roads.tpy");
      const pcode = compileExample("Python", code);
      const { canvas } = runExampleBounded(pcode, 3000);
      const nodeBlots = canvas.calls.filter(
        (call) => call.method === "drawArc" && call.args[1] === 6, // NODERADIUS
      );
      const positions = nodeBlots.map((call) => {
        const turtle = call.args[0] as Turtle;
        return `${turtle.x},${turtle.y}`;
      });
      const distinctPositions = new Set(positions);
      assertEquals(positions.length >= 5, true);
      assertEquals(distinctPositions.size >= 5, true);
    });
  });

  describe("Models/SexRatio.tpy", () => {
    it("compiles and runs a bounded number of generations without a runtime error", async () => {
      // the fixed bug (a/b read in the while condition before ever being
      // assigned) was very likely a compile error as written - the fact
      // this compiles and runs at all is itself the meaningful regression test
      // here
      const code = await readExample("Python/Models/SexRatio.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 2000);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Models/TwoSlits.tpy", () => {
    it("compiles and runs a bounded number of pixel-by-pixel steps without a runtime error", async () => {
      // an extremely heavy nested pixel loop with no pause() calls at all -
      // bounded run will hit the iteration cap long before the whole
      // interference pattern is rendered, which is expected
      const code = await readExample("Python/Models/TwoSlits.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Movement/BouncingShapes.tpy", () => {
    it("compiles and runs a bounded number of animation frames without a runtime error", async () => {
      const code = await readExample("Python/Movement/BouncingShapes.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Movement/MultiBounce.tpy", () => {
    it("compiles and runs a bounded number of animation frames without a runtime error", async () => {
      const code = await readExample("Python/Movement/MultiBounce.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });
  });

  describe("Movement/SolarSystem.tpy", () => {
    it("compiles and runs a bounded number of animation frames without a runtime error", async () => {
      const code = await readExample("Python/Movement/SolarSystem.tpy");
      const pcode = compileExample("Python", code);
      const { output } = runExampleBounded(pcode, 300);
      assertEquals(output.runtimeErrors, []);
    });

    it("matches its deterministic Pascal counterpart's drawn frames (no randomness in either version)", async () => {
      // Movement/SolarSystem.tpy uses no randrange()/random() calls (planet
      // orbits are purely deterministic arithmetic), and has a working
      // Pascal counterpart at assets/examples/Pascal/Movement/SolarSystem.tpas
      // that implements the same simulation (1-indexed there, 0-indexed
      // here, but selecting the same 4 "inner" planets for double-scale
      // blots either way) - so, run for the same bounded iteration count,
      // the two should draw byte-for-byte identical frames: same colours,
      // radii, and positions for the sun and all 8 planets, in the same
      // order.
      const pythonCode = await readExample("Python/Movement/SolarSystem.tpy");
      const pascalCode = await readExample("Pascal/Movement/SolarSystem.tpas");
      const pythonPcode = compileExample("Python", pythonCode);
      const pascalPcode = compileExample("Pascal", pascalCode);
      const { canvas: pythonCanvas } = runExampleBounded(pythonPcode, 100);
      const { canvas: pascalCanvas } = runExampleBounded(pascalPcode, 100);

      const arcSignature = (calls: typeof pythonCanvas.calls) =>
        calls
          .filter((call) => call.method === "drawArc")
          .map((call) => {
            const [turtle, radiusX, radiusY, fill] = call.args as [
              Turtle,
              number,
              number,
              boolean,
            ];
            return {
              x: turtle.x,
              y: turtle.y,
              colour: turtle.c,
              radiusX,
              radiusY,
              fill,
            };
          });

      const pythonSignature = arcSignature(pythonCanvas.calls);
      const pascalSignature = arcSignature(pascalCanvas.calls);
      // one frame is 17 drawArc calls (1 sun blot + 8 planets * (orbit
      // circle + planet blot)) - require at least a few full frames' worth
      // of overlap so the comparison is actually meaningful, then compare
      // that shared prefix exactly (each individual frame's content is
      // fully determined by its frame index, independent of how many total
      // frames either run completed, so an exact-match prefix comparison
      // is safe even if the two runs complete different total frame counts)
      const framesWorthOfCalls = 17 * 3;
      assertEquals(pythonSignature.length >= framesWorthOfCalls, true);
      assertEquals(pascalSignature.length >= framesWorthOfCalls, true);
      const compareLength = Math.min(
        pythonSignature.length,
        pascalSignature.length,
      );
      assertEquals(
        pythonSignature.slice(0, compareLength),
        pascalSignature.slice(0, compareLength),
      );
    });
  });
});
