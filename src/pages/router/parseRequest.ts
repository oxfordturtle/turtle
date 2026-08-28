import { parseCookie } from "@/client/state/cookie.ts";
import type { RequestParams } from "../types.ts";
import { asafelyOptional } from "../utils/tools.ts";

export default async (request: Request): Promise<RequestParams> => {
  const method = request.method;
  const url = new URL(request.url);
  const sections = combinePath(splitPath(url.pathname));
  const page = sections[1] ?? sections[0];
  const formData = await asafelyOptional(() => request.formData());
  // The one thing a request says about the person making it: the five settings
  // the page's markup differs by. Anything unreadable is simply absent, so a
  // hand-edited or truncated cookie degrades to the defaults rather than failing.
  const settings = parseCookie(request.headers.get("cookie"));
  return { method, url, sections, page, formData, settings };
};

const splitPath = (path: string) =>
  path
    .split("/")
    .slice(1)
    .filter((x) => x !== "");

const combinePath = (bits: string[]): [string, ...string[]] => [
  bits[0] || "index",
  ...bits.slice(1),
];
