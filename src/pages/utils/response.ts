import { contentType } from "media_types";
import { basename, extname } from "path";

export const htmlResponse = async (
  html: string,
  status: number = 200,
): Promise<Response> =>
  new Response(html, await responseInit("text/html", status));

export const jsonResponse = async (
  object: Record<string, unknown>,
  status: number = 200,
): Promise<Response> =>
  new Response(
    JSON.stringify(object),
    await responseInit("application/json", status),
  );

export const fileResponse = async (
  file: BodyInit,
  path: string,
): Promise<Response> =>
  new Response(
    file,
    await responseInit(
      contentType(extname(path)) ?? "application/octet-stream",
      200,
      basename(path),
    ),
  );

export const redirectResponse = async (path: string): Promise<Response> =>
  new Response(null, await redirectResponseInit(path));

const responseInit = (
  contentType: string,
  status: number,
  filename?: string,
): ResponseInit => {
  const headers = new Headers(headersInit(contentType));
  if (filename !== undefined) {
    headers.append("content-disposition", `inline; filename=${filename}`);
  }
  return { headers, status };
};

const redirectResponseInit = (url: string): ResponseInit => {
  const headers = new Headers();
  headers.append("location", url);
  return { headers, status: 302 };
};

const headersInit = (contentType: string): HeadersInit => ({
  "content-type": contentType,
  date: new Date().toUTCString(),
});
