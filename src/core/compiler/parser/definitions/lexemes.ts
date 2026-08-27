import type { Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import type { Routine } from "./routine.ts";

/**
 * A position in the lexeme stream, as handed out by `mark` and handed back to
 * `seek`. It is an index into the underlying array, but nothing outside this
 * module should depend on that.
 */
export type Mark = number;

/**
 * The parser's cursor over the lexeme stream.
 *
 * Most of the parser walks forwards, with `peek`, `advance`, `match` and
 * `expect`. But BASIC, C, Java, Python and TypeScript are two-pass: they scan
 * once to find the subroutine boundaries, then rewind and parse the bodies.
 * That is why the cursor also offers random access - `mark`, `seek`, `at` and
 * `indexOf` - rather than only moving forwards, and why it is what remembers
 * where each routine's body lies: `setBody`, `seekBody`, `seekPastBody` and
 * `inBody` are the second pass's whole vocabulary.
 */
export interface Lexemes {
  /** how many lexemes there are altogether */
  readonly length: number;

  /** the lexeme `offset` places from the cursor (0, the default, being the current one) */
  peek(offset?: number): Lexeme | undefined;

  /** moves the cursor on one lexeme */
  advance(): void;

  /** whether the cursor has run past the last lexeme */
  atEnd(): boolean;

  /** moves past the current lexeme if it has this content, and says whether it did */
  match(content: string): boolean;

  /**
   * Moves past the current lexeme if it has this content, or throws `message`
   * against `blame` - by default that same lexeme, i.e. whatever was found in
   * its place. Pass `blame` when some lexeme further back names the construct
   * the error is really about: the "if" whose opening bracket is missing, say.
   */
  expect(content: string, message: string, blame?: Lexeme): void;

  /**
   * Moves past the current lexeme if it has this content, or throws `message`
   * against the *previous* lexeme - the one `content` was meant to follow. Use
   * this rather than `expect` when the stream may have run dry, since then
   * there is no current lexeme for the error to point at.
   */
  expectAfter(content: string, message: string): void;

  /**
   * Moves past any comments. Called right before a control structure decides
   * whether its body is a block or a single statement: parseStatement treats a
   * comment as a complete no-op statement, so a comment between the keyword and
   * the real body would otherwise be taken for the whole body.
   */
  skipComments(): void;

  /** the cursor's position, to be handed back to `seek` */
  mark(): Mark;

  /** moves the cursor to a position given by `mark` */
  seek(mark: Mark): void;

  /** the lexeme at an absolute position, wherever the cursor happens to be */
  at(mark: Mark): Lexeme | undefined;

  /** the position of the first lexeme with this content, or -1 if there is none */
  indexOf(content: string): Mark;

  /**
   * Records which lexemes make up a routine's body: `start` is its first, and
   * `end` the one just past its last - the closing curly bracket in the
   * C-family languages, the closing DEDENT in Python. Called by the pass that
   * finds the routine, and read by the one that parses it.
   */
  setBody(routine: Routine, start: Mark, end: Mark): void;

  /** moves the cursor to the first lexeme of a routine's body */
  seekBody(routine: Routine): void;

  /** moves the cursor just past the last lexeme of a routine's body */
  seekPastBody(routine: Routine): void;

  /** whether the cursor is still short of the end of a routine's body */
  inBody(routine: Routine): boolean;
}

const makeLexemes = (lexemes: Lexeme[]): Lexemes => {
  let index = 0;
  const bodies = new Map<Routine, { start: Mark; end: Mark }>();

  const peek = (offset = 0): Lexeme | undefined => lexemes[index + offset];

  // non-null: nothing asks where a routine's body is before the pass that
  // found the routine has called setBody on it
  const bodyOf = (routine: Routine) => bodies.get(routine)!;

  return {
    length: lexemes.length,

    peek,

    advance() {
      index += 1;
    },

    atEnd() {
      return index >= lexemes.length;
    },

    match(content) {
      if (peek()?.content !== content) {
        return false;
      }
      index += 1;
      return true;
    },

    expect(content, message, blame) {
      if (peek()?.content !== content) {
        throw new CompilerError(message, blame ?? peek());
      }
      index += 1;
    },

    expectAfter(content, message) {
      if (peek()?.content !== content) {
        throw new CompilerError(message, peek(-1));
      }
      index += 1;
    },

    skipComments() {
      while (peek()?.type === "comment") {
        index += 1;
      }
    },

    mark() {
      return index;
    },

    seek(mark) {
      index = mark;
    },

    at(mark) {
      return lexemes[mark];
    },

    indexOf(content) {
      return lexemes.findIndex((x) => x.content === content);
    },

    setBody(routine, start, end) {
      bodies.set(routine, { start, end });
    },

    seekBody(routine) {
      index = bodyOf(routine).start;
    },

    seekPastBody(routine) {
      index = bodyOf(routine).end + 1;
    },

    inBody(routine) {
      return index < bodyOf(routine).end;
    },
  };
};

export default makeLexemes;
