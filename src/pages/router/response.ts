import type { RequestParams } from "../types.ts";
import { fileResponse } from "../utils/response.ts";
import about from "../about.ts";
import contact from "../contact.ts";
import documentation from "../documentation.ts";
import error from "../error.ts";
import index from "../index.ts";
import { asafelyOptional } from "../utils/tools.ts";

export default async (requestParams: RequestParams): Promise<Response> => {
  const assetDirectories = ["build", "images", "examples"];
  return assetDirectories.includes(requestParams.sections[0])
    ? await asset(requestParams)
    : await page(requestParams);
};

const asset = async (requestParams: RequestParams): Promise<Response> => {
  const path = `./assets/${requestParams.sections.join("/")}`;
  const file = await asafelyOptional(() => Deno.readFile(path));
  return file === undefined
    ? error(requestParams, 404)
    : fileResponse(file, path);
};

const page = async (requestParams: RequestParams): Promise<Response> =>
  handler[requestParams.sections[0]]
    ? await handler[requestParams.sections[0]](requestParams)
    : error(requestParams, 404);

const handler: Record<
  string,
  (requestParams: RequestParams) => Response | Promise<Response>
> = {
  index,
  documentation,
  about,
  contact,
};
