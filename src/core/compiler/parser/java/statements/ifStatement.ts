import { type KeywordLexeme } from "../../../lexer/lexeme.ts";
import { CompilerError } from "../../../tools/error.ts";
import parseExpression from "../../common/expression.ts";
import typeCheck from "../../common/typeCheck.ts";
import type { Lexemes } from "../../definitions/lexemes.ts";
import { type Subroutine } from "../../definitions/routines/subroutine.ts";
import makeIfStatement, {
  type IfStatement,
} from "../../definitions/statements/ifStatement.ts";
import parseBlock from "./block.ts";

const parseIfStatement = (
  ifLexeme: KeywordLexeme,
  lexemes: Lexemes,
  routine: Subroutine,
): IfStatement => {
  if (!lexemes.get() || lexemes.get()?.content !== "(") {
    throw new CompilerError(
      '"if" must be followed by an opening bracket "(".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  // deno-coverage-ignore-start -- unreachable: the last consumed lexeme is
  // "(", which can never be the program's final lexeme (program.ts guarantees
  // that's "}"), so the stream cannot be dry here
  if (!lexemes.get()) {
    throw new CompilerError(
      '"if (" must be followed by a Boolean expression.',
      lexemes.get(-1),
    );
  }
  // deno-coverage-ignore-stop
  let condition = parseExpression(lexemes, routine);
  condition = typeCheck(routine.language, condition, "boolean");

  if (!lexemes.get() || lexemes.get()?.content !== ")") {
    throw new CompilerError(
      '"if (..." must be followed by a closing bracket ")".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  const ifStatement = makeIfStatement(ifLexeme, condition);

  if (!lexemes.get() || lexemes.get()?.content !== "{") {
    throw new CompilerError(
      '"if (...)" must be followed by an opening curly bracket "{".',
      lexemes.get(-1),
    );
  }
  lexemes.next();

  ifStatement.ifStatements.push(...parseBlock(lexemes, routine));

  if (lexemes.get() && lexemes.get()?.content === "else") {
    lexemes.next();

    if (!lexemes.get() || lexemes.get()?.content !== "{") {
      throw new CompilerError(
        '"else" must be followed by an opening bracket "{".',
        lexemes.get(-1),
      );
    }
    lexemes.next();

    ifStatement.elseStatements.push(...parseBlock(lexemes, routine));
  }

  return ifStatement;
};

export default parseIfStatement;
