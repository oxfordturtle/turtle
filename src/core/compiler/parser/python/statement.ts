import { type Lexeme } from "../../lexer/lexeme.ts";
import { CompilerError } from "../../tools/error.ts";
import * as find from "../common/find.ts";
import parseProcedureCall, {
  parseMethodProcedureCall,
} from "../common/procedureCall.ts";
import makeVariableValue from "../definitions/expressions/variableValue.ts";
import type { Lexemes } from "../definitions/lexemes.ts";
import type { Routine } from "../definitions/routine.ts";
import type { Subroutine } from "../definitions/routines/subroutine.ts";
import type { Statement } from "../definitions/statement.ts";
import makeBreakStatement from "../definitions/statements/breakStatement.ts";
import makeContinueStatement from "../definitions/statements/continueStatement.ts";
import makePassStatement from "../definitions/statements/passStatement.ts";
import identifiers from "./identifiers.ts";
import eosCheck from "./statements/eosCheck.ts";
import parseForStatement from "./statements/forStatement.ts";
import parseIfStatement from "./statements/ifStatement.ts";
import parseReturnStatement from "./statements/returnStatement.ts";
import parseVariableAssignment from "./statements/variableAssignment.ts";
import parseVariableDeclaration from "./statements/variableDeclaration.ts";
import parseWhileStatement from "./statements/whileStatement.ts";

export default (
  lexeme: Lexeme,
  lexemes: Lexemes,
  routine: Routine,
): Statement => {
  let statement: Statement;

  switch (lexeme.type) {
    case "comment":
      lexemes.next();
      statement = makePassStatement();
      break;

    case "newline":
      // usually impossible - new lines are eaten at the end of the previous
      // statement - but it can happen at the start of the program or a block,
      // if there's a comment on the
      lexemes.next();
      statement = makePassStatement();
      break;

    case "identifier": {
      const name = lexemes.get()?.content as string;
      // "foo" is a read-position lookup, which falls through to an enclosing
      // scope: a method receiver, and an indexed write like "mylist[i] = v",
      // read rather than rebind the name. A plain "name = value" is a real
      // binding and must not fall through - see find.assignmentTarget.
      const isIndexed = lexemes.get(1)?.content === "[";
      const foo = find.variable(routine, name);
      const assignTarget = isIndexed
        ? undefined
        : find.assignmentTarget(routine, name);
      const bar = find.command(routine, name);
      if (foo && lexemes.get(1)?.content === ".") {
        // "mylist.append(64)" as a bare statement
        lexemes.next(); // move past the variable name
        lexemes.next(); // move past "."
        const methodLexeme = lexemes.get();
        if (methodLexeme?.type !== "identifier") {
          throw new CompilerError(
            "Method name missing after '.'.",
            lexemes.get(),
          );
        }
        const method = find.nativeCommand(
          routine,
          `.${methodLexeme.value}`,
          foo.isList,
        );
        if (!method) {
          throw new CompilerError(
            `Method "${methodLexeme.value}" is not defined.`,
            methodLexeme,
          );
        }
        lexemes.next();
        const variableValue = makeVariableValue(lexeme, foo);
        statement = parseMethodProcedureCall(
          methodLexeme,
          lexemes,
          routine,
          method,
          variableValue,
        );
      } else if (isIndexed && foo) {
        // an indexed write is not a name-binding, so "foo" is the right lookup
        lexemes.next();
        statement = parseVariableAssignment(lexeme, lexemes, routine, foo);
      } else if (assignTarget) {
        lexemes.next();
        statement = parseVariableAssignment(
          lexeme,
          lexemes,
          routine,
          assignTarget,
        );
      } else if (foo) {
        // the name exists in an enclosing scope but is not local here, so
        // assigning to it creates a local that shadows it
        statement = parseVariableDeclaration(lexeme, lexemes, routine);
      } else if (bar) {
        lexemes.next();
        statement = parseProcedureCall(lexeme, lexemes, routine, bar);
      } else {
        statement = parseVariableDeclaration(lexeme, lexemes, routine);
      }
      eosCheck(lexemes);
      break;
    }

    case "keyword":
      switch (lexeme.subtype) {
        case "def": {
          const sub = find.subroutine(
            routine,
            lexemes.get(1)?.content as string,
          ) as Subroutine;
          // already defined in the first pass; lexemes[sub.end] is the final
          // DEDENT, so jump past it
          lexemes.index = sub.end + 1;
          statement = makePassStatement();
          break;
        }

        case "global":
        case "nonlocal":
          lexemes.next();
          if (routine.__ === "Program") {
            throw new CompilerError(
              "{lex} statements can only occur inside a subroutine.",
              lexemes.get(-1),
            );
          }
          if (lexemes.get(-1)?.content === "global") {
            routine.globals.push(...identifiers(lexemes, routine, "global"));
          } else {
            routine.nonlocals.push(
              ...identifiers(lexemes, routine, "nonlocal"),
            );
          }
          statement = makePassStatement();
          eosCheck(lexemes);
          break;

        case "return":
          lexemes.next();
          statement = parseReturnStatement(lexeme, lexemes, routine);
          break;

        case "if":
          lexemes.next();
          statement = parseIfStatement(lexeme, lexemes, routine);
          break;

        case "else":
          throw new CompilerError(
            'Statement cannot begin with "else". If you have an "if" above, this line may need to be indented more.',
            lexemes.get(),
          );

        case "for":
          lexemes.next();
          statement = parseForStatement(lexeme, lexemes, routine);
          break;

        case "while":
          lexemes.next();
          statement = parseWhileStatement(lexeme, lexemes, routine);
          break;

        case "pass":
          lexemes.next();
          eosCheck(lexemes);
          statement = makePassStatement();
          break;

        case "break":
          if (routine.loopDepth === 0) {
            throw new CompilerError(
              "'break' is only allowed inside a loop.",
              lexeme,
            );
          }
          lexemes.next();
          eosCheck(lexemes);
          statement = makeBreakStatement();
          break;

        case "continue":
          if (routine.loopDepth === 0) {
            throw new CompilerError(
              "'continue' is only allowed inside a loop.",
              lexeme,
            );
          }
          lexemes.next();
          eosCheck(lexemes);
          statement = makeContinueStatement();
          break;

        default:
          throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
      }
      break;

    case "indent":
      throw new CompilerError("Statement cannot be indented.", lexeme);

    default:
      throw new CompilerError("Statement cannot begin with {lex}.", lexeme);
  }

  return statement;
};
