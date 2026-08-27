import { html, type HtmlResult } from "@merivale/womble";
import "@/islands/turtle-system/index.ts";
import type { RequestParams } from "./types.ts";
import page from "./_layout/page.ts";
import { htmlResponse } from "./utils/response.ts";

export default (requestParams: RequestParams): Promise<Response> =>
  htmlResponse(page(requestParams, { main: main() }));

// The system app is one component, so this route is one tag.
// `src/islands/turtle-system.ts` renders the header, the menu and both sections
// of the IDE, and its subtree renders everything inside them.
//
// The query parameters a link into the system can carry (`?l=`, `?x=`) are not
// passed as attributes: nothing renders differently for either of them, so
// their two readers take them off `document.location` instead.
const main = (): HtmlResult => html` <turtle-system /> `;
