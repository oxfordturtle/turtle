import { PCode } from "@/core/constants.ts";
import type { Cycle } from "./types.ts";
import { MachineError } from "./error.ts";
import * as memory from "./memory.ts";
import * as arithmetic from "./operators/arithmetic.ts";
import * as canvas from "./operators/canvas.ts";
import * as comparison from "./operators/comparison.ts";
import * as conversion from "./operators/conversion.ts";
import * as files from "./operators/files.ts";
import * as flow from "./operators/flow.ts";
import * as io from "./operators/io.ts";
import * as lists from "./operators/lists.ts";
import * as stack from "./operators/stack.ts";
import * as strings from "./operators/strings.ts";
import * as turtle from "./operators/turtle.ts";
import * as variables from "./operators/variables.ts";
import { input, ports, setPorts, state, vcanvas } from "./state.ts";
import type {
  Canvas,
  FileSystem,
  MachineOptions,
  Output,
  Timers,
} from "./types.ts";

export const reset = (): void => {
  vcanvas.startx = 0;
  vcanvas.starty = 0;
  vcanvas.sizex = 1000;
  vcanvas.sizey = 1000;
  vcanvas.width = 1000;
  vcanvas.height = 1000;
  vcanvas.doubled = false;
  ports.canvas.setResolution(1000, 1000, false);
  ports.output.configureConsole(true, "#FFFFFF");
  ports.output.configureOutput(true, "#FFFFFF");
  ports.output.updateTurtleProperty("x", 500);
  ports.output.updateTurtleProperty("y", 500);
  ports.output.updateTurtleProperty("d", 0);
  ports.output.updateTurtleProperty("a", 360);
  ports.output.updateTurtleProperty("t", 2);
  ports.output.updateTurtleProperty("c", "#000");
  ports.canvas.setVirtualCanvas(0, 0, 1000, 1000);
};

/**
 * Note the parameter names: `canvas`, `output`, `timers` and `files` here are
 * the *ports*, not the same-named operator modules imported above. Nothing in
 * this function - or in `reset`/`halt`/`playOrPause` - reaches for an operator,
 * and `execute()` deliberately does not destructure `ports` for the same
 * reason.
 */
export const run = (
  pcode: number[][],
  options: MachineOptions,
  timers: Timers,
  output: Output,
  canvas: Canvas,
  files: FileSystem,
): void => {
  input.pcode = pcode;
  input.options = options;
  setPorts({ timers, output, canvas, files });
  reset();
  state.line = 0;
  state.code = 0;
  // invalidates any async port call still in flight from a previous run; see
  // suspendFor
  state.runToken += 1;
  if (options.showCanvasOnRun) {
    output.selectTab("canvas");
  }
  memory.init(options);
  state.startTime = timers.now();
  state.lastClickTime = -Infinity;
  state.update = true;
  state.keyecho = true;
  state.seed = timers.now();
  state.pcodeHalt = -1;
  state.trueValue = 1;
  state.running = true;
  state.paused = false;
  output.notifyStateChange("played");
  execute();
};

export const halt = (): void => {
  if (state.running) {
    ports.canvas.setCursor(1);
    state.running = false;
    state.paused = false;
    ports.output.notifyStateChange("halted");
  }
};

export const isRunning = (): boolean => {
  return state.running;
};

export const playOrPause = (): void => {
  if (state.running) {
    if (state.paused) {
      state.paused = false;
      ports.output.notifyStateChange("unpaused");
    } else {
      state.paused = true;
      ports.output.notifyStateChange("paused");
    }
  }
};

const missingLineError = (): MachineError =>
  new MachineError(
    "The program has tried to jump to a line that does not exist. This is either a bug in our compiler, or in your assembled code.",
  );

/** the pcode line the program counter is on, throwing if there is no such line */
const currentLine = (): readonly number[] => {
  const line = input.pcode[state.line];
  if (line === undefined) {
    throw missingLineError();
  }
  return line;
};

/**
 * The word the program counter points at: an opcode at the top of execute()'s
 * loop, and each of its operands in turn as `cycle.operand()` steps past them.
 *
 * Running off the end of a line is the sibling fault to jumping to a line that
 * isn't there - an instruction short of the operands it declares - and worth
 * reporting as such rather than reading `undefined` and dispatching on it.
 */
const currentWord = (): number => {
  const word = currentLine()[state.code];
  if (word === undefined) {
    throw new MachineError(
      "The program has run past the end of a line. This is either a bug in our compiler, or in your assembled code.",
    );
  }
  return word;
};

/**
 * The manual equivalent of the bottom of execute()'s while loop, for any
 * operator that suspends (RDLN, TDET, WAIT, and the file operators) rather than
 * falling through to the loop's own advancement.
 */
export const advancePastCurrentInstruction = (): void => {
  state.code += 1;
  if (state.code === currentLine().length) {
    state.line += 1;
    state.code = 0;
  }
};

/**
 * Creates a human readable MachineError.
 */
const reportableError = (error: unknown): MachineError => {
  if (error instanceof MachineError) {
    return error;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new MachineError(
    `Something has gone wrong inside the Turtle machine (${detail}). This is not an error in your program.`,
  );
};

/**
 * Jumps to the nearest enclosing TRY block if one is active, else halts and
 * reports. Shared by execute()'s try/catch and suspendFor's rejection path.
 */
const handleExecutionError = (error: unknown): void => {
  if (memory.tryStack.length !== 0) {
    const [xcptLine, stackHeight] = memory.tryStack.pop()!;
    state.line = xcptLine;
    state.code = 0;
    // an error thrown mid-expression would otherwise leave partial operands
    // behind (Pascal restores trystack[].stackheight the same way)
    memory.stack.length = stackHeight;
  } else {
    halt();
    ports.output.notifyRuntimeError(reportableError(error));
  }
};

/**
 * Suspends execute()'s loop until `promise` settles, then resumes - the
 * mechanism the whole filesystem operator set is built on. Bails out without
 * touching memory if a new run() has started in the meantime (state.runToken):
 * a stale promise from a superseded run must never mutate the new run's state.
 */
export const suspendFor = <T>(
  promise: Promise<T>,
  onValue: (value: T) => void,
): void => {
  const token = state.runToken;
  promise.then(
    (value) => {
      if (state.runToken !== token) return;
      try {
        onValue(value);
      } catch (error) {
        handleExecutionError(error);
        execute();
        return;
      }
      execute();
    },
    (error) => {
      if (state.runToken !== token) return;
      handleExecutionError(error);
      execute();
    },
  );
};

/**
 * Runs pcode until a draw/instruction budget is spent, then reschedules itself.
 *
 * The switch below is one line of body per arm - every operator's code lives in
 * `operators/`, grouped under the same section headings that
 * `constants/pcodes.ts` declares them under and `runtime.test.ts` tests them
 * under, so all three read side by side. It stays *inline* here rather than
 * moving to a `step(cycle)` of its own: measured on the example suite, the
 * extra call costs 9-14% on the array-heavy programs.
 */
export const execute = (): void => {
  if (!state.running) {
    return;
  }

  if (state.paused) {
    ports.timers.scheduleCallback(execute, 1);
    return;
  }

  state.detectActive = false;
  state.readlineTimeoutID = 0;

  memory.delayedHeapClear();

  const { options } = input;
  let drawCount = 0;
  let codeCount = 0;
  let suspended = false;

  /**
   * Built here, once per call. The budgets and the suspension flag stay plain
   * locals, so the loop below reads them directly and the operators reach them
   * through these closures. Constructing anything per *instruction* is what
   * `Cycle`'s own doc comment warns against.
   */
  const cycle: Cycle = {
    options,
    canvas: ports.canvas,
    output: ports.output,
    timers: ports.timers,
    files: ports.files,
    operand: (): number => {
      state.code += 1;
      return currentWord();
    },
    drew: (): void => {
      if (state.update) {
        drawCount += 1;
      }
    },
    forceUpdate: (): void => {
      drawCount = options.drawCountMax;
    },
    suspend: (): void => {
      suspended = true;
    },
  };

  try {
    while (
      drawCount < options.drawCountMax &&
      codeCount <= options.codeCountMax
    ) {
      const code = currentWord();
      switch (code) {
        // basic stack operations
        case PCode.null:
          stack.null();
          break;
        case PCode.drop:
          stack.drop();
          break;
        case PCode.dupl:
          stack.dupl();
          break;
        case PCode.swap:
          stack.swap();
          break;
        case PCode.rota:
          stack.rota();
          break;
        case PCode.roll:
          stack.roll();
          break;
        case PCode.pick:
          stack.pick(cycle);
          break;

        // operators on stack value
        case PCode.incr:
          arithmetic.incr();
          break;
        case PCode.decr:
          arithmetic.decr();
          break;
        case PCode.neg:
          arithmetic.neg();
          break;
        case PCode.abs:
          arithmetic.abs();
          break;
        case PCode.sign:
          arithmetic.sign();
          break;

        // random numbers
        case PCode.rand:
          arithmetic.rand();
          break;
        case PCode.seed:
          arithmetic.seed(cycle);
          break;

        // maximum integer
        case PCode.mxin:
          arithmetic.mxin();
          break;

        // true value
        case PCode.true:
          arithmetic.true(cycle);
          break;

        // Boolean (bitwise) operators
        case PCode.shft:
          arithmetic.shft();
          break;
        case PCode.not:
          arithmetic.not();
          break;
        case PCode.and:
          arithmetic.and();
          break;
        case PCode.or:
          arithmetic.or();
          break;
        case PCode.xor:
          arithmetic.xor();
          break;

        // lazy Boolean operators
        case PCode.andl:
          arithmetic.andl();
          break;
        case PCode.orl:
          arithmetic.orl();
          break;

        // binary integer operators
        case PCode.plus:
          arithmetic.plus();
          break;
        case PCode.subt:
          arithmetic.subt();
          break;
        case PCode.mult:
          arithmetic.mult();
          break;
        case PCode.divr:
          arithmetic.divr();
          break;
        case PCode.div:
          arithmetic.div();
          break;
        case PCode.mod:
          arithmetic.mod();
          break;

        // floored integer division
        case PCode.divf:
          arithmetic.divf();
          break;
        case PCode.modf:
          arithmetic.modf();
          break;

        // pseudo-real number operators
        case PCode.divm:
          arithmetic.divm();
          break;
        case PCode.lerp:
          arithmetic.lerp();
          break;
        case PCode.hyp:
          arithmetic.hyp();
          break;
        case PCode.root:
          arithmetic.root();
          break;
        case PCode.powr:
          arithmetic.powr();
          break;
        case PCode.log:
          arithmetic.log();
          break;
        case PCode.alog:
          arithmetic.alog();
          break;
        case PCode.ln:
          arithmetic.ln();
          break;
        case PCode.exp:
          arithmetic.exp();
          break;
        case PCode.sin:
          arithmetic.sin();
          break;
        case PCode.cos:
          arithmetic.cos();
          break;
        case PCode.tan:
          arithmetic.tan();
          break;
        case PCode.asin:
          arithmetic.asin();
          break;
        case PCode.acos:
          arithmetic.acos();
          break;
        case PCode.atan:
          arithmetic.atan();
          break;
        case PCode.pi:
          arithmetic.pi();
          break;

        // integer/Boolean comparison operators
        case PCode.eqal:
          comparison.eqal();
          break;
        case PCode.noeq:
          comparison.noeq();
          break;
        case PCode.less:
          comparison.less();
          break;
        case PCode.more:
          comparison.more();
          break;
        case PCode.lseq:
          comparison.lseq();
          break;
        case PCode.mreq:
          comparison.mreq();
          break;
        case PCode.maxi:
          comparison.maxi();
          break;
        case PCode.mini:
          comparison.mini();
          break;

        // string comparison operators
        case PCode.seql:
          comparison.seql();
          break;
        case PCode.sneq:
          comparison.sneq();
          break;
        case PCode.sles:
          comparison.sles();
          break;
        case PCode.smor:
          comparison.smor();
          break;
        case PCode.sleq:
          comparison.sleq();
          break;
        case PCode.smeq:
          comparison.smeq();
          break;
        case PCode.smax:
          comparison.smax();
          break;
        case PCode.smin:
          comparison.smin();
          break;

        // string operators
        case PCode.case:
          strings.case();
          break;
        case PCode.copy:
          strings.copy();
          break;
        case PCode.dels:
          strings.dels();
          break;
        case PCode.inss:
          strings.inss();
          break;
        case PCode.poss:
          strings.poss();
          break;
        case PCode.repl:
          strings.repl();
          break;
        case PCode.scat:
          strings.scat();
          break;
        case PCode.slen:
          strings.slen();
          break;
        case PCode.smul:
          strings.smul();
          break;
        case PCode.spad:
          strings.spad();
          break;
        case PCode.trim:
          strings.trim();
          break;

        // python string tests
        case PCode.ctst:
          strings.ctst();
          break;
        case PCode.ernf:
          strings.ernf();
          break;

        // string/array/list bound test
        case PCode.test:
          variables.test(cycle);
          break;

        // exception handling
        case PCode.try:
          flow.try(cycle);
          break;
        case PCode.xcpt:
          flow.xcpt();
          break;

        // list operators (Python)
        case PCode.lapp:
          lists.lapp(cycle);
          break;
        case PCode.lcpy:
          lists.lcpy(cycle);
          break;
        case PCode.lext:
          lists.lext(cycle);
          break;
        case PCode.lidx:
          lists.lidx(cycle);
          break;
        case PCode.lins:
          lists.lins(cycle);
          break;
        case PCode.lmul:
          lists.lmul(cycle);
          break;
        case PCode.lprt:
          lists.lprt(cycle);
          break;
        case PCode.lrem:
          lists.lrem(cycle);
          break;
        case PCode.ldel:
          lists.ldel(cycle);
          break;
        case PCode.lrev:
          lists.lrev(cycle);
          break;
        case PCode.liad:
          lists.liad(cycle);
          break;
        case PCode.lihp:
          lists.lihp(cycle);
          break;

        // file processing
        case PCode.chdr:
          files.chdr(cycle);
          break;
        case PCode.file:
          files.file(cycle);
          break;
        case PCode.open:
          files.open(cycle);
          break;
        case PCode.clos:
          files.clos(cycle);
          break;
        case PCode.fbeg:
          files.fbeg(cycle);
          break;
        case PCode.eof:
          files.eof(cycle);
          break;
        case PCode.eoln:
          files.eoln(cycle);
          break;
        case PCode.frds:
          files.frds(cycle);
          break;
        case PCode.frln:
          files.frln(cycle);
          break;
        case PCode.fwrs:
          files.fwrs(cycle);
          break;
        case PCode.fwln:
          files.fwln(cycle);
          break;

        // remaining file processing (directory/search/move)
        case PCode.diry:
          files.diry(cycle);
          break;
        case PCode.ffnd:
          files.ffnd(cycle);
          break;
        case PCode.fdir:
          files.fdir(cycle);
          break;
        case PCode.fnxt:
          files.fnxt(cycle);
          break;
        case PCode.fmov:
          files.fmov(cycle);
          break;

        // type conversion operators
        case PCode.ctos:
          conversion.ctos();
          break;
        case PCode.sasc:
          conversion.sasc();
          break;
        case PCode.itos:
          conversion.itos();
          break;
        case PCode.hexs:
          conversion.hexs();
          break;
        case PCode.sval:
          conversion.sval();
          break;
        case PCode.svdf:
          conversion.svdf();
          break;
        case PCode.qtos:
          conversion.qtos();
          break;
        case PCode.qval:
          conversion.qval();
          break;

        // debugging and tracing
        case PCode.trac:
          io.trac();
          break;
        case PCode.memw:
          io.memw();
          break;
        case PCode.dump:
          io.dump(cycle);
          break;
        case PCode.pcoh:
          io.pcoh();
          break;
        case PCode.poke:
          io.poke();
          break;

        // canvas state
        case PCode.canv:
          canvas.canv(cycle);
          break;
        case PCode.reso:
          canvas.reso(cycle);
          break;
        case PCode.udat:
          canvas.udat(cycle);
          break;

        // basic turtle settings
        case PCode.home:
          turtle.home(cycle);
          break;
        case PCode.setx:
          turtle.setx(cycle);
          break;
        case PCode.sety:
          turtle.sety(cycle);
          break;
        case PCode.setd:
          turtle.setd(cycle);
          break;
        case PCode.angl:
          turtle.angl(cycle);
          break;
        case PCode.thik:
          turtle.thik(cycle);
          break;
        case PCode.pen:
          turtle.pen(cycle);
          break;
        case PCode.colr:
          turtle.colr(cycle);
          break;

        // turtle movement
        case PCode.toxy:
          turtle.toxy(cycle);
          break;
        case PCode.mvxy:
          turtle.mvxy(cycle);
          break;
        case PCode.drxy:
          turtle.drxy(cycle);
          break;
        case PCode.fwrd:
          turtle.fwrd(cycle);
          break;
        case PCode.back:
          turtle.back(cycle);
          break;
        case PCode.left:
          turtle.left(cycle);
          break;
        case PCode.rght:
          turtle.rght(cycle);
          break;
        case PCode.turn:
          turtle.turn(cycle);
          break;

        // fills and colours
        case PCode.blnk:
          canvas.blnk(cycle);
          break;
        case PCode.rcol:
          canvas.rcol(cycle);
          break;
        case PCode.fill:
          canvas.fill(cycle);
          break;
        case PCode.pixc:
          canvas.pixc(cycle);
          break;
        case PCode.pixs:
          canvas.pixs(cycle);
          break;
        case PCode.rgb:
          canvas.rgb();
          break;
        case PCode.mixc:
          canvas.mixc();
          break;

        // drawing shapes
        case PCode.rmbr:
          canvas.rmbr();
          break;
        case PCode.frgt:
          canvas.frgt();
          break;
        case PCode.poly:
          canvas.poly(cycle);
          break;
        case PCode.pfil:
          canvas.pfil(cycle);
          break;
        case PCode.circ:
          canvas.circ(cycle);
          break;
        case PCode.blot:
          canvas.blot(cycle);
          break;
        case PCode.elps:
          canvas.elps(cycle);
          break;
        case PCode.eblt:
          canvas.eblt(cycle);
          break;
        case PCode.box:
          canvas.box(cycle);
          break;

        // loading the (evaluation) stack
        case PCode.ldin:
          variables.ldin(cycle);
          break;
        case PCode.ldvg:
          variables.ldvg(cycle);
          break;
        case PCode.ldvv:
          variables.ldvv(cycle);
          break;
        case PCode.ldvr:
          variables.ldvr(cycle);
          break;
        case PCode.ldag:
          variables.ldag(cycle);
          break;
        case PCode.ldav:
          variables.ldav(cycle);
          break;
        case PCode.lstr:
          variables.lstr(cycle);
          break;

        // storing from the (evaluation) stack
        case PCode.stvg:
          variables.stvg(cycle);
          break;
        case PCode.stvv:
          variables.stvv(cycle);
          break;
        case PCode.stvr:
          variables.stvr(cycle);
          break;

        // pointer and string/array operations
        case PCode.lptr:
          variables.lptr();
          break;
        case PCode.sptr:
          variables.sptr();
          break;
        case PCode.zptr:
          variables.zptr();
          break;
        case PCode.cptr:
          variables.cptr();
          break;
        case PCode.cstr:
          variables.cstr();
          break;
        case PCode.hstr:
          variables.hstr();
          break;

        // flow control
        case PCode.jump:
          flow.jump(cycle);
          break;
        case PCode.ifno:
          flow.ifno(cycle);
          break;
        case PCode.halt:
          flow.halt();
          break;
        case PCode.subr:
          flow.subr(cycle);
          break;
        case PCode.retn:
          flow.retn();
          break;
        case PCode.pssr:
          flow.pssr(cycle);
          break;
        case PCode.plsr:
          flow.plsr();
          break;
        case PCode.psrj:
          flow.psrj();
          break;
        case PCode.plrj:
          flow.plrj();
          break;

        // memory management
        case PCode.ldmt:
          variables.ldmt();
          break;
        case PCode.stmt:
          variables.stmt();
          break;
        case PCode.memc:
          variables.memc(cycle);
          break;
        case PCode.memr:
          variables.memr(cycle);
          break;
        case PCode.hfix:
          variables.hfix();
          break;
        case PCode.hclr:
          variables.hclr(cycle);
          break;
        case PCode.hrst:
          variables.hrst();
          break;

        // input
        case PCode.stat:
          io.stat();
          break;
        case PCode.iclr:
          io.iclr();
          break;
        case PCode.bufr:
          io.bufr();
          break;
        case PCode.read:
          io.read();
          break;
        case PCode.rdln:
          io.rdln(cycle);
          break;
        case PCode.tdet:
          io.tdet(cycle);
          break;
        case PCode.curs:
          io.curs(cycle);
          break;

        // text output
        case PCode.kech:
          io.kech();
          break;
        case PCode.outp:
          io.outp(cycle);
          break;
        case PCode.cons:
          io.cons(cycle);
          break;
        case PCode.disp:
          io.disp(cycle);
          break;
        case PCode.writ:
          io.writ(cycle);
          break;
        case PCode.newl:
          io.newl(cycle);
          break;

        // timing
        case PCode.time:
          io.time(cycle);
          break;
        case PCode.tset:
          io.tset(cycle);
          break;
        case PCode.wait:
          io.wait(cycle);
          break;

        // anything else is an error
        default:
          throw new MachineError(
            `Unknown PCode 0x${code.toString(16)} at line ${state.line}, code ${
              state.code
            }.`,
          );
      }
      // HALT clears state.running; a suspending operator has advanced the
      // program counter itself and arranged its own resumption. Either way the
      // loop must neither advance again nor reschedule.
      if (!state.running || suspended) {
        return;
      }
      codeCount += 1;
      state.code += 1;
      const nextLine = currentLine();
      if (state.pcodeHalt === state.line) {
        halt();
        return;
      }
      if (state.code === nextLine.length) {
        // line wrap
        state.line += 1;
        state.code = 0;
      }
    }
  } catch (error) {
    handleExecutionError(error);
  }
  // scheduling rather than recursing lets this function return, so the canvas
  // is painted before the next block runs
  ports.timers.scheduleCallback(execute, 0);
};
