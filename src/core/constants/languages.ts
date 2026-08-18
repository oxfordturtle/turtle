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
