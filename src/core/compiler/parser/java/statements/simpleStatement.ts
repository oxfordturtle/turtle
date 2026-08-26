import makeParseSimpleStatement from "../../cFamily/statements/simpleStatement.ts";
import constant from "../constant.ts";
import variable from "../variable.ts";

export default makeParseSimpleStatement({ constant, variable });
