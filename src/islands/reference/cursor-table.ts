import { html, type HtmlResult } from "@merivale/womble";
import { cursors } from "@/core/constants.ts";

// Fully static data, so this is not a Womble island at all - no define(), no
// state, no reactivity - just a plain markup function, like the notes and help
// pages. (Unlike colour-table, nothing here varies by language.)
export default (): HtmlResult => html`
  <table>
    <thead>
      <tr>
        <th>No.</th>
        <th>Name</th>
        <th>No.</th>
        <th>Name</th>
        <th>No.</th>
        <th>Name</th>
        <th>No.</th>
        <th>Name</th>
      </tr>
    </thead>
    <tbody>
      ${chunk(cursors, 4).map(
        (row) => html`
          <tr>
            ${row.map(
              (cursor) => html`
                <td>${cursor.index}</td>
                <td style="cursor:${cursor.css}">${cursor.name}</td>
              `,
            )}
          </tr>
        `,
      )}
    </tbody>
  </table>
`;

const chunk = <T>(items: readonly T[], size: number): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
};
