import { define, html } from "@merivale/womble";
import { getComments, programStore } from "./program.ts";
import { paneClasses, paneSources, paneAttributes } from "./tab-pane.ts";

// The Comments tab: every comment the lexer found in the current program.
define("comments-tab", {
  attributes: paneAttributes,
  sources: [...paneSources, programStore],
  render: ({ active }) => html`
    <div class="${paneClasses(active, "expert,machine")}">
      <table>
        <thead>
          <tr>
            <th>Line</th>
            <th>Comment</th>
          </tr>
        </thead>
        <tbody>
          ${getComments().map(
            (comment) => html`
              <tr>
                <td>${comment.line.toString(10)}</td>
                <td>${comment.value}</td>
              </tr>
            `,
          )}
        </tbody>
      </table>
    </div>
  `,
});
