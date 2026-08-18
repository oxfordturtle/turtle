import { html, type HtmlResult } from "@merivale/womble";
import { code } from "./lib.ts";

export default (): HtmlResult => html`
  <p>
    The Turtle System has 50 predefined colour constants, shown in the table
    below. Every command that takes a colour argument (e.g. the
    ${code("colour")} command, which sets the Turtle’s current drawing colour)
    can be given an RGB value, or one of the predefined colour names below. The
    compiler will translate this name into the corresponding RGB value.
    Alternatively, you can also use the corresponding number between 1 and 50
    together with the ${code("rgb")} command. For example, ${code("blue")} is
    equivalent to ${code("rgb(3)")}.
  </p>
`;
