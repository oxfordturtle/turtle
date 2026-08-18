import { html, type HtmlResult } from "@merivale/womble";
import { code } from "./lib.ts";

export default (): HtmlResult => html`
  <p>
    The native ${code("cursor")} command sets which cursor to display when the
    mouse is over the canvas. Setting it to 0 makes the mouse invisible. Values
    in the range 1-15 set it to the cursor shown in the table below (move your
    mouse over each box to preview the cursor). Any other value will reset to
    the default cursor. Note that the actual cursor displayed depends on your
    operating system, and may vary from computer to computer.
  </p>
`;
