import { asafely } from "./utils/tools.ts";
import parseRequest from "./router/parseRequest.ts";
import response from "./router/response.ts";
import error from "./error.ts";

export default async (request: Request): Promise<Response> => {
  const requestParams = await parseRequest(request);
  const result = await asafely(() => response(requestParams));
  if (result[0] === "left") {
    console.log(result[1]);
    return error(requestParams, 500);
  }
  return result[1];
};
