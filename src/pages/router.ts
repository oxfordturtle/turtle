import { asafely } from "./utils/tools.ts";
import parseRequest from "./router/parseRequest.ts";
import response from "./router/response.ts";
import error from "./error.ts";

export default async (request: Request): Promise<Response> => {
  const requestParams = await parseRequest(request);
  const result = await asafely(() => response(requestParams));
  // deno-coverage-ignore-start -- a last-resort guard no constructible Request
  // can reach today: response() resolves every failure a request can cause to a
  // 4xx of its own (unknown routes 404, asset reads and formData parsing are
  // swallowed by asafelyOptional), and Womble degrades a failed island render
  // to a log entry rather than a throw. Kept so a future handler that does
  // throw becomes a 500 page instead of a dropped connection.
  if (result[0] === "left") {
    console.log(result[1]);
    return error(requestParams, 500);
  }
  // deno-coverage-ignore-stop
  return result[1];
};
