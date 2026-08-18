import type { RequestParams } from "../types.ts";
import { asafelyOptional } from "../utils/tools.ts";

export default async (request: Request): Promise<RequestParams> => {
  const method = request.method;
  const url = new URL(request.url);
  const sections = combinePath(splitPath(url.pathname));
  const page = sections[1] ?? sections[0];
  const formData = await asafelyOptional(() => request.formData());
  return { method, url, sections, page, formData };
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
