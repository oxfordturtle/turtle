import { html, type HtmlResult } from "@merivale/womble";
import { fonts } from "@/core/constants.ts";

// Fully static (same reasoning as cursor-table.ts) — not a Womble island.
export default (): HtmlResult => html`
  <table>
    <thead>
      <tr>
        <th>Font Family Name</th>
        <th>Plain</th>
        <th>Italic</th>
        <th>Bold</th>
        <th>Italic+Bold</th>
        <th>Underlined</th>
        <th>Strikethrough</th>
      </tr>
    </thead>
    <tbody>
      ${fonts.map(
        (font) => html`
          <tr style="font-family: ${font.css};">
            <td>${font.name}</td>
            <td>${font.index}</td>
            <td style="font-style: italic;">${font.index + 16}</td>
            <td style="font-weight: bold;">${font.index + 32}</td>
            <td style="font-style: italic; font-weight: bold;">
              ${font.index + 48}
            </td>
            <td style="text-decoration: underline;">${font.index + 64}</td>
            <td style="text-decoration: line-through;">${font.index + 128}</td>
          </tr>
        `,
      )}
    </tbody>
  </table>
`;
