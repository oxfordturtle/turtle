import { html, type HtmlResult } from "@merivale/womble";
import { inputs } from "@/core/constants.ts";

// Fully static (same reasoning as cursor-table.ts) — not a Womble island.
//
// NOTE: the original (client/components/reference/keycodes.ts) renders each
// row as [code(keycode.name), keycode.value] under headers [Number, Name] —
// i.e. the columns look swapped (the "Number" column shows the keycode's
// *name*, "Name" shows its *value*). Preserved exactly as-is rather than
// silently fixed, and flagged separately as a likely bug worth its own change.
export default (): HtmlResult => html`
  <table>
    <thead>
      <tr>
        <th>Number</th>
        <th>Name</th>
      </tr>
    </thead>
    <tbody>
      ${inputs
        .filter((x) => x.value > 0)
        .map(
          (keycode) => html`
            <tr>
              <td><code>${keycode.name}</code></td>
              <td>${keycode.value}</td>
            </tr>
          `,
        )}
    </tbody>
  </table>
`;
