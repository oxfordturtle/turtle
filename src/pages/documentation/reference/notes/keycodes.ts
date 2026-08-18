import { html, type HtmlResult } from "@merivale/womble";
import { code } from "./lib.ts";

export default (): HtmlResult => html`
  <p>
    The ${code("keyStatus")} and ${code("reset")} commands both take an integer
    parameter specifying the index of the key in the key status array (see the
    <a href="{{ path('documentation_help', {tab: 'input'}) }}"
      >Turtle Languages Help: User Input</a
    >
    page). These indexes correspond to the standard numeric codes for keys used
    in a variety of contexts. To save you from having to remember them, the
    <em>Turtle System</em> has several predefined constants providing you with
    simpler mnemonics for these codes. The full list is given below.
  </p>
`;
