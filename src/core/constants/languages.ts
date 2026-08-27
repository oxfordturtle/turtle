export type Language = (typeof languages)[number];

export const languages = [
  "BASIC",
  "C",
  "Java",
  "Pascal",
  "Python",
  "TypeScript",
] as const;

export const extension: Record<Language, string> = {
  BASIC: "tbas",
  C: "tc",
  Java: "tjav",
  Pascal: "tpas",
  Python: "tpy",
  TypeScript: "tts",
};

export const trueValue: Record<Language, 1 | -1> = {
  BASIC: -1,
  C: -1,
  Java: -1,
  Pascal: -1,
  Python: 1,
  TypeScript: 1,
};

/**
 * What a language can do, as opposed to how it is written.
 *
 * This is the semantics axis. The syntax axis is elsewhere - the precedence
 * ladders in `compiler/parser/definitions/operators.ts`, the token patterns in
 * `compiler/tokenizer/tokenize.ts` - and the two do not agree: TypeScript is
 * written like C and behaves like Python; Pascal and BASIC share reference
 * parameters and nothing else here. So a language is a row in each table, and
 * neither table is a family tree.
 *
 * A fact belongs here if it has a name a teacher would recognise ("Pascal
 * isn't case sensitive"). A one-off quirk of one language's grammar does not,
 * and stays in that language's own parser.
 */
export interface LanguageTraits {
  /** Identifiers and keywords fold to lower case before anything compares them. */
  readonly caseInsensitive: boolean;
  /** Indexing a string yields a character rather than a one-character string. */
  readonly characterType: boolean;
  /** The index of a string's first character. */
  readonly stringIndexBase: 0 | 1;
  /** Whether the program body is a `main` routine or the top level of the file. */
  readonly entryPoint: "main" | "top-level";
  /** Whether a function may be called as a statement, discarding its result. */
  readonly statementCalls: "any" | "procedures-only";
  /**
   * Whether parameters can be passed by reference - Pascal's `var`, BASIC's
   * `RETURN`. Read nowhere: each of those two parsers is the only place the
   * syntax exists, so this row is documentation of what they implement.
   */
  readonly referenceParameters: boolean;
  /** Whether an integer is accepted where a boolean is expected. */
  readonly booleanIsInteger: boolean;
  /**
   * Fixed-size arrays with a compile-time bound, or dynamic lists. Read
   * nowhere yet: TypeScript's `number[10]` is a stop-gap awaiting Python's
   * list machinery, and Java is to follow. This is the field that is about to
   * change, and the reason for asking the question in one place.
   */
  readonly arrays: "fixed" | "dynamic";
}

export const traits: Record<Language, LanguageTraits> = {
  BASIC: {
    caseInsensitive: false,
    characterType: false,
    stringIndexBase: 0,
    entryPoint: "top-level",
    statementCalls: "procedures-only",
    referenceParameters: true,
    booleanIsInteger: false,
    arrays: "fixed",
  },
  C: {
    caseInsensitive: false,
    characterType: true,
    stringIndexBase: 0,
    entryPoint: "main",
    statementCalls: "procedures-only",
    referenceParameters: false,
    booleanIsInteger: false,
    arrays: "fixed",
  },
  Java: {
    caseInsensitive: false,
    characterType: true,
    stringIndexBase: 0,
    entryPoint: "main",
    statementCalls: "procedures-only",
    referenceParameters: false,
    booleanIsInteger: false,
    arrays: "fixed",
  },
  Pascal: {
    caseInsensitive: true,
    characterType: true,
    stringIndexBase: 1,
    entryPoint: "top-level",
    statementCalls: "procedures-only",
    referenceParameters: true,
    booleanIsInteger: false,
    arrays: "fixed",
  },
  Python: {
    caseInsensitive: false,
    characterType: false,
    stringIndexBase: 0,
    entryPoint: "top-level",
    statementCalls: "any",
    referenceParameters: false,
    booleanIsInteger: true,
    arrays: "dynamic",
  },
  TypeScript: {
    caseInsensitive: false,
    characterType: false,
    stringIndexBase: 0,
    entryPoint: "top-level",
    statementCalls: "any",
    referenceParameters: false,
    booleanIsInteger: true,
    arrays: "fixed",
  },
};

/**
 * Normalises an identifier or keyword for comparison, folding case in the
 * languages that ignore it.
 */
export const foldCase = (language: Language, name: string): string =>
  traits[language].caseInsensitive ? name.toLowerCase() : name;
