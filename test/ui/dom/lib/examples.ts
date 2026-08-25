/**
 * A `fetch` replacement for the example loaders (`program.setFetcher`), serving
 * `assets/examples/` from disk: this layer has no network, and the real pages
 * request `/examples/${language}/${groupId}/${filename}` from their own origin.
 *
 * Every request's pathname is recorded in `requests`, so a test can assert
 * which URL was fetched - or, on a page where the `?x=` handling is gated off,
 * that nothing was. Empty the array (`requests.length = 0`) before each test
 * that reads it.
 */

export const requests: string[] = [];

export const diskFetcher: typeof fetch = async (input) => {
  const path =
    typeof input === "string"
      ? new URL(input, "http://localhost/").pathname
      : input instanceof URL
        ? input.pathname
        : new URL(input.url).pathname;
  requests.push(path);
  try {
    // this file lives at test/ui/dom/lib/, so the repo root is four levels up
    const text = await Deno.readTextFile(
      new URL(`../../../../assets${path}`, import.meta.url),
    );
    return new Response(text, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
};

/**
 * What the disk fetcher would serve for this path, for asserting that the
 * opened file holds the real example's code.
 */
export const exampleFromDisk = (path: string): Promise<string> =>
  Deno.readTextFile(new URL(`../../../../assets${path}`, import.meta.url));

/**
 * Waits (macrotask by macrotask, bounded) for a condition an async chain sets:
 * opening an example goes through the fetcher's promises, which resolve after
 * `mountRoute` has already returned.
 */
export const eventually = async (
  predicate: () => boolean,
  what: string,
): Promise<void> => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`timed out waiting for ${what}`);
};
