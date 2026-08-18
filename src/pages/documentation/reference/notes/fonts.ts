import { html, type HtmlResult } from "@merivale/womble";
import { code } from "./lib.ts";

export default (): HtmlResult => html`
  <p>
    The <em>Turtle System</em> has 16 fonts for drawing text on the canvas,
    shown in the table below. The ${code("print")} command takes a
    <code>font</code> parameter, which must be an integer between 0 and 255. The
    integers in the range 0-15 correspond to plain versions of the 16 fonts. To
    render the text in italics, add 16 to this base; to render it in bold, add
    32; to render it underlined, add 64; and to render it with a line through,
    add 128. These additions are cumulative, so to render the text in italic and
    bold, for example, add 48 (i.e. 16+32).
  </p>
`;
