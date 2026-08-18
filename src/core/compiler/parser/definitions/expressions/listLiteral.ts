import type { Lexeme } from "../../../lexer/lexeme.ts";
import {
  type Expression,
  type ExpressionCommon,
  makeExpression,
} from "../expression.ts";

export interface ListLiteral extends ExpressionCommon {
  readonly expressionType: "listLiteral";
  readonly lexeme: Lexeme;
  readonly elements: Expression[];
  // undefined for an empty literal, whose element kind isn't yet known; always
  // "integer" for a nested one, whose elements are opaque sublist pointers
  readonly listElementKind?: "integer" | "string";
  // a nested literal ("[[0,1],[2,3]]"); innerListElementKind is the sublists'
  // own scalar element kind
  readonly isListOfLists?: boolean;
  readonly innerListElementKind?: "integer" | "string";
}

const makeListLiteral = (
  lexeme: Lexeme,
  elements: Expression[],
  listElementKind?: "integer" | "string",
  isListOfLists?: boolean,
  innerListElementKind?: "integer" | "string",
): ListLiteral => ({
  ...makeExpression(),
  expressionType: "listLiteral",
  lexeme,
  elements,
  listElementKind,
  isListOfLists,
  innerListElementKind,
});

export default makeListLiteral;
