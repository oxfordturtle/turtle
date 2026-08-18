import type { RequestParams } from "./types.ts";
import { redirectResponse } from "./utils/response.ts";
import error from "./error.ts";
import help from "./documentation/help.ts";
import reference from "./documentation/reference.ts";

// `/documentation` has no page of its own, so it redirects to the first one
// there is - the order of `handler` below, which is the order the site nav lists
// them in.
export default (requestParams: RequestParams): Promise<Response> => {
  const section = requestParams.sections[1];
  return section === undefined
    ? redirectResponse(
        `${requestParams.url.origin}/documentation/${Object.keys(handler)[0]}`,
      )
    : handler[section]
      ? handler[section](requestParams)
      : error(requestParams, 404);
};

const handler: Record<
  string,
  (requestParams: RequestParams) => Promise<Response>
> = {
  help,
  reference,
};
