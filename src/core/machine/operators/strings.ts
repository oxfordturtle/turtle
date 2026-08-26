import { MachineError } from "../error.ts";
import { DEFAULT_STRING_SIZE } from "../limits.ts";
import * as memory from "../memory.ts";

// PCode.case's conversion operand (Win_TurtleRun.pas's pcCase)
const CASE_LOWER = 1;
const CASE_UPPER = 2;
const CASE_SENTENCE = 3;
const CASE_TITLE = 4;
const CASE_TOGGLE = 5;

const capitalised = (word: string): string =>
  word.slice(0, 1).toUpperCase() + word.slice(1).toLowerCase();

// case conversion

const caseOperator = (): void => {
  const conversion = memory.popValue();
  const string = memory.popString();
  switch (conversion) {
    case CASE_LOWER:
      memory.makeHeapString(string.toLowerCase());
      break;
    case CASE_UPPER:
      memory.makeHeapString(string.toUpperCase());
      break;
    case CASE_SENTENCE:
      memory.makeHeapString(capitalised(string));
      break;
    case CASE_TITLE:
      memory.makeHeapString(string.split(" ").map(capitalised).join(" "));
      break;
    case CASE_TOGGLE:
      memory.makeHeapString(
        string
          .split("")
          .map((x) =>
            x === x.toLowerCase() ? x.toUpperCase() : x.toLowerCase(),
          )
          .join(""),
      );
      break;
    default:
      // this should be impossible
      memory.makeHeapString(string);
      break;
  }
};

export { caseOperator as case };

// string operators
//
// COPY/DELS/INSS index from 1, transcribing Pascal's Copy/Delete/Insert, and
// clamp an index below 1 up to 1 exactly as Delphi's do - see `startFrom`
// below (TODO.md §1.4, fixed).
//
// They keep the deprecated String.substr, which takes a *length* as the
// Pascal originals do, where `slice`/`substring` take an end index. The clamp
// is what makes that safe: substr's first argument counts backwards from the
// end when negative, which is precisely the bug that was fixed, and an index
// of 1 or more can no longer reach it.

/** A 1-based Pascal string index as a 0-based JavaScript one, clamped as Delphi clamps it. */
const startFrom = (index: number): number => Math.max(index, 1) - 1;

export const copy = (): void => {
  const length = memory.popValue();
  const start = startFrom(memory.popValue());
  const string = memory.popString();
  memory.makeHeapString(string.substr(start, length));
};

export const dels = (): void => {
  const length = memory.popValue();
  const start = startFrom(memory.popValue());
  const string = memory.popString();
  memory.makeHeapString(
    string.substr(0, start) + string.substr(start + length),
  );
};

export const inss = (): void => {
  const start = startFrom(memory.popValue());
  const stringPointer = memory.popValue();
  const substringPointer = memory.popValue();
  const string = memory.getHeapString(stringPointer);
  const substring = memory.getHeapString(substringPointer);
  memory.makeHeapString(
    string.substr(0, start) + substring + string.substr(start),
  );
};

export const poss = (): void => {
  const stringPointer = memory.popValue();
  const substringPointer = memory.popValue();
  const string = memory.getHeapString(stringPointer);
  const substring = memory.getHeapString(substringPointer);
  memory.stack.push(string.indexOf(substring) + 1);
};

export const repl = (): void => {
  const count = memory.popValue();
  const replacementPointer = memory.popValue();
  const findPointer = memory.popValue();
  const subjectPointer = memory.popValue();
  const replacement = memory.getHeapString(replacementPointer);
  const find = memory.getHeapString(findPointer);
  const subject = memory.getHeapString(subjectPointer);
  // `find` is a literal find-string, never a regex: a RegExp built from it would
  // misread metacharacters in perfectly valid plain text
  let result = subject;
  if (count < 1) {
    // one split/join pass over the *original* subject, so it can't loop forever
    // when the replacement contains the find string (replacing "a" with "aa")
    result = find === "" ? subject : subject.split(find).join(replacement);
  } else if (find !== "") {
    // splitting the *original* subject up front stops a later replacement
    // re-matching text an earlier one just inserted
    const parts = subject.split(find);
    const replaceCount = Math.min(count, parts.length - 1);
    result =
      parts.slice(0, replaceCount + 1).join(replacement) +
      (parts.length > replaceCount + 1
        ? find + parts.slice(replaceCount + 1).join(find)
        : "");
  }
  memory.makeHeapString(result);
};

export const scat = (): void => {
  // both pointers are popped before either is resolved, shallowest first: see
  // comparison.ts's note on why the order is load-bearing
  const rightPointer = memory.popValue();
  const leftPointer = memory.popValue();
  const right = memory.getHeapString(rightPointer);
  const left = memory.getHeapString(leftPointer);
  memory.makeHeapString(left + right);
};

export const slen = (): void => {
  memory.stack.push(memory.peek(memory.popValue()));
};

export const smul = (): void => {
  const count = memory.popValue();
  const string = memory.popString();
  memory.makeHeapString(string.repeat(Math.max(count, 0)));
};

export const spad = (): void => {
  const padding = memory.popValue();
  const padPointer = memory.popValue();
  const subjectPointer = memory.popValue();
  const pad = memory.getHeapString(padPointer);
  const subject = memory.getHeapString(subjectPointer);
  const width = Math.min(Math.abs(padding), DEFAULT_STRING_SIZE);
  if (pad.length === 0 && subject.length < width) {
    // an empty pad string would make the loop below never terminate
    throw new MachineError("Cannot pad a string with an empty string.");
  }
  let result = subject;
  while (result.length + pad.length <= width) {
    if (padding < 0) {
      result = result + pad;
    } else {
      result = pad + result;
    }
  }
  memory.makeHeapString(result);
};

export const trim = (): void => {
  memory.makeHeapString(memory.popString().trim());
};

// python string tests

export const ctst = (): void => {
  // peeks rather than pops: the compiler reuses the tested value
  const string = memory.getHeapString(memory.peekValue());
  if (string.length !== 1) {
    throw new MachineError(
      `String is not a single character (length ${string.length}).`,
    );
  }
};

export const ernf = (): void => {
  // peeks rather than pops: the compiler reuses the tested value
  if (memory.peekValue() < 0) {
    throw new MachineError("Value not found in the list.");
  }
};
