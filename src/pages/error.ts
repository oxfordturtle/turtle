import { html, type HtmlResult } from "@merivale/womble";
import type { RequestParams } from "./types.ts";
import page from "./_layout/page.ts";
import { htmlResponse } from "./utils/response.ts";

export type ErrorCode = 404 | 405 | 400 | 500;

export default (
  requestParams: RequestParams,
  errorCode: ErrorCode,
): Promise<Response> =>
  htmlResponse(errorPages[errorCode](requestParams), errorCode);

const errorPage =
  (heading: HtmlResult, body: HtmlResult) =>
  (requestParams: RequestParams): string =>
    page(requestParams, { header: heading, main: body });

const errorPages: Record<ErrorCode, (requestParams: RequestParams) => string> =
  {
    [404]: errorPage(
      html` <h1>Not Found</h1> `,
      html`
        <p>
          This page could not be found. Please navigate the site using the menus
          above.
        </p>
      `,
    ),
    [405]: errorPage(
      html` <h1>Method not Allowed</h1> `,
      html` <p>This method is not allowed at this URL.</p> `,
    ),
    [400]: errorPage(
      html` <h1>Bad Request</h1> `,
      html` <p>The data you sent doesn't make sense.</p> `,
    ),
    [500]: errorPage(
      html` <h1>Internal Server Error</h1> `,
      html` <p>Something went wrong.</p> `,
    ),
  };
