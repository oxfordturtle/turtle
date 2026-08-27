import type { Language } from "@/core/constants.ts";
import type { Type } from "../../lexer/types.ts";

export interface Constant {
  readonly kind: "constant";
  readonly name: string;
  readonly language: Language;
  readonly value: number | string;
  readonly type: Type;
}

const makeConstant = (
  language: Language,
  name: string,
  value: number | string,
): Constant => ({
  kind: "constant",
  name,
  language,
  value,
  type: typeof value === "number" ? "boolint" : ("string" satisfies Type),
});

export default makeConstant;
