import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import type { Program } from "../../definitions/routines/program.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeWhileStatement, {
  type WhileStatement,
} from "../../definitions/statements/whileStatement.ts";
import parseBlock from "./block.ts";

const parseWhileStatement = (
  whileLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Program | Subroutine,
): WhileStatement => {
  if (!lexemes.get() || lexemes.get()?.content !== "(") {
    throw new CompilerError(
      '"while" must be followed by an opening bracket "(".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  if (!lexemes.get()) {
    throw new CompilerError(
      '"while (" must be followed by a Boolean expression.',
      lexemes.get(-1),
    );
  }
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (!lexemes.get() || lexemes.get()?.content !== ")") {
    throw new CompilerError(
      '"while (..." must be followed by a closing bracket ")".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  const whileStatement = makeWhileStatement(whileLexeme, condition);

  if (!lexemes.get() || lexemes.get()?.content !== "{") {
    throw new CompilerError(
      '"while (...)" must be followed by an opening curly bracket "{".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  routine.loopDepth += 1;
  whileStatement.statements.push(...parseBlock(lexemes, routine));
  routine.loopDepth -= 1;

  return whileStatement;
};

export default parseWhileStatement;
