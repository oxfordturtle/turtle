import { PCode, pcodeArgs } from "@/core/constants.ts";
import { getAllSubroutines } from "../parser/definitions/routine.ts";
import type { Program } from "../parser/definitions/routines/program.ts";
import type { Subroutine } from "../parser/definitions/routines/subroutine.ts";
import type { Options } from "./options.ts";
import { defaultOptions } from "./options.ts";
import programStart from "./program/programStart.ts";
import { resolve as resolveRelativeJumps } from "./relativeJumps.ts";
import statements from "./program/statements.ts";
import subroutines from "./program/subroutines.ts";

export default (
  program: Program,
  options: Options = defaultOptions,
): number[][] => {
  const startCode = programStart(program, options);

  const subroutinesStartLine =
    getAllSubroutines(program).length > 0
      ? startCode.length + 2 // + 1 for jump line past subroutines
      : startCode.length + 1;

  // also reports each subroutine's start line, which the back-patch below needs
  const { pcode: subroutinesCode, startLines } = subroutines(
    getAllSubroutines(program),
    subroutinesStartLine,
    options,
  );

  const programStartLine = subroutinesStartLine + subroutinesCode.length;

  const innerCode = statements(program, programStartLine, options);

  const jumpLine = [
    [PCode.jump, startCode.length + subroutinesCode.length + 2],
  ];
  const pcode =
    subroutinesCode.length > 1
      ? startCode.concat(jumpLine).concat(subroutinesCode).concat(innerCode)
      : startCode.concat(innerCode);

  backPatchSubroutineCalls(program, pcode, startLines);

  // safe here and not before: everything below appends lines at the end only,
  // and addHCLR splices within a line without ever adding one, so no line's
  // number changes from this point on
  resolveRelativeJumps(pcode);

  if (program.language === "C" || program.language === "Java") {
    // the first parser pass has already errored if there is no "main"
    const main = program.subroutines.find(
      (x) => x.name === "main",
    ) as Subroutine;
    pcode.push([PCode.subr, startLines.get(main) as number]);
  }

  addHCLR(pcode);
  pcode.push([PCode.halt]);

  return pcode;
};

const backPatchSubroutineCalls = (
  program: Program,
  pcode: number[][],
  startLines: Map<Subroutine, number>,
): void => {
  for (const line of pcode) {
    for (let j = 0; j < line.length; j += 1) {
      if (line[j - 1] === PCode.subr) {
        const subroutine = getAllSubroutines(program).find(
          (x) => x.index === line[j],
        );
        if (subroutine) {
          line[j] = startLines.get(subroutine) as number;
        }
      }
    }
  }
};

const addHCLR = (pcode: number[][]): void => {
  // A program that uses lists gets no HCLR at all. Lists are heap-resident and
  // must survive indefinitely, but HCLR rewinds heapTemp to heapPerm, which
  // un-reserves their blocks for the next allocation - and the next allocation
  // need not have anything to do with lists: an unrelated print('literal') is
  // enough to overwrite one. Proving which later sites are safe isn't worth it;
  // the cost of skipping HCLR is heap used, never incorrectness.
  if (programUsesListOps(pcode)) {
    return;
  }

  for (const line of pcode) {
    let heapStringMade = false;
    let heapStringNeeded = false;
    let lastJumpIndex: number | null = null;
    let i = 0;
    while (i < line.length) {
      // in range by the loop condition, as is the operand count an
      // opcode with a variable number of arguments carries after it
      const code = line[i]!;
      if (heapStringCodes.indexOf(code) >= 0) {
        heapStringMade = true;
      }
      if (code === PCode.subr) {
        heapStringNeeded = true;
      }
      if (code === PCode.jump || code === PCode.ifno) {
        lastJumpIndex = i;
      }
      const args = pcodeArgs(code);
      i += args === -1 ? line[i + 1]! + 2 : args + 1;
    }
    if (heapStringMade && !heapStringNeeded) {
      if (lastJumpIndex !== null) {
        line.splice(lastJumpIndex, 0, PCode.hclr);
      } else if (line[line.length - 1] !== PCode.hclr) {
        line.push(PCode.hclr);
      }
    }
  }
};

/**
 * Walks opcode boundaries rather than scanning for the numeric values: a list
 * opcode's value also occurs as other instructions' plain operands, and a naive
 * scan would suppress HCLR for programs that never touch a list.
 */
const programUsesListOps = (pcode: number[][]): boolean => {
  for (const line of pcode) {
    let i = 0;
    while (i < line.length) {
      const code = line[i]!;
      if (listOpCodes.indexOf(code) >= 0) {
        return true;
      }
      const args = pcodeArgs(code);
      i += args === -1 ? line[i + 1]! + 2 : args + 1;
    }
  }
  return false;
};

const listOpCodes = [
  PCode.lapp,
  PCode.lcpy,
  PCode.lext,
  PCode.lidx,
  PCode.lins,
  PCode.lmul,
  PCode.lprt,
  PCode.lrem,
  PCode.lrev,
  PCode.liad,
  PCode.lihp,
  PCode.ldel,
];

const heapStringCodes = [
  PCode.hstr,
  PCode.ctos,
  PCode.itos,
  PCode.hexs,
  PCode.qtos,
  PCode.smax,
  PCode.smin,
  PCode.scat,
  PCode.case,
  PCode.copy,
  PCode.dels,
  PCode.inss,
  PCode.repl,
  PCode.spad,
  PCode.lstr,
  PCode.read,
  PCode.rdln,
  PCode.frds,
  PCode.frln,
  PCode.ffnd,
  PCode.fdir,
  PCode.fnxt,
];
