import { extension, type Language } from "@/core/constants.ts";

// A file in the system's file memory: plain data with no DOM in it, so it lives
// beside the store that owns it (./program.ts) rather than in src/client.

export class File {
  language: Language;
  example: string | null;
  name: string;
  code: string;
  backup: string;
  compiled: boolean;
  edited: boolean;

  constructor(language: Language, example: string | null = null) {
    this.language = language;
    this.example = example;
    this.name = "";
    this.code = "";
    this.backup = "";
    this.compiled = false;
    this.edited = false;
  }

  get extension(): string {
    return extension[this.language];
  }

  get filename(): string {
    return `${this.name || "filename"}.${this.extension}`;
  }
}

/**
 * Rebuilds a `File` from what `sessionStorage` gives back. `JSON.parse` can't
 * restore a prototype, so without this a restored file arrives with no
 * `extension` or `filename`.
 */
export const restoreFile = (stored: unknown): File => {
  const file = new File("Python");
  return Object.assign(file, stored as Partial<File>);
};

export const skeletons: Record<Language, string> = {
  BASIC: "var1% = 100\nCOLOUR(GREEN)\nBLOT(var1%)\nEND",
  C: "void main () {\n  int var1 = 100;\n  colour(green);\n  blot(var1);\n}",
  Java: "class ProgramName {\n  void main () {\n    int var1 = 100;\n    colour(green);\n    blot(var1);\n  }\n}",
  Pascal:
    "PROGRAM programName;\nVAR var1: integer;\nBEGIN\n  var1 := 100;\n  colour(green);\n  blot(var1)\nEND.",
  Python: "var1: int = 100\ncolour(green)\nblot(var1)",
  TypeScript: "var var1 = 100;\ncolour(green);\nblot(var1);",
};
