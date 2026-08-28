import { html, type HtmlResult, type StoreSeed } from "@merivale/womble";
import { examples, extension } from "@/core/constants.ts";
import "@/islands/turtle-system/index.ts";
import { programStore } from "@/islands/turtle-system/program.ts";
import type { RequestParams } from "./types.ts";
import page, { languageFor } from "./_layout/page.ts";
import { htmlResponse } from "./utils/response.ts";
import { asafelyOptional } from "./utils/tools.ts";

export default async (requestParams: RequestParams): Promise<Response> =>
  htmlResponse(
    page(requestParams, {
      main: main(),
      seeds: await exampleSeeds(requestParams),
    }),
  );

// The system app is one component, so this route is one tag.
// `src/islands/turtle-system.ts` renders the header, the menu and both sections
// of the IDE, and its subtree renders everything inside them.
//
// The language a link can carry (`?l=`) is not passed as an attribute: the
// layout has already resolved it into the settings store, which every component
// that varies by it reads for itself.
const main = (): HtmlResult => html` <turtle-system /> `;

/**
 * The example a `?x=` link asked for, read off disk and seeded into the program
 * store so the browser needs no fetch to open it.
 *
 * **This is why `/?x=Triangle` doesn't flash.** The browser used to restore the
 * file memory, render it, and only then fetch the example and replace what it
 * had just drawn. Seeding makes the content available synchronously, so
 * `initialise()` places it before the islands hydrate.
 *
 * Everything here degrades to "no seed": an unknown id, an example a language
 * hasn't got, an unreadable file. The browser then simply shows the file memory,
 * which is what it would have shown anyway.
 */
const exampleSeeds = async (
  requestParams: RequestParams,
): Promise<StoreSeed[]> => {
  const id = requestParams.url.searchParams.get("x");
  if (!id) return [];
  const example = examples.find((candidate) => candidate.id === id);
  if (!example) return [];
  const language = languageFor(requestParams);
  const name = `${example.id}.${extension[language]}`;
  const code = await asafelyOptional(() =>
    Deno.readTextFile(
      `./assets/examples/${language}/${example.groupId}/${name}`,
    ),
  );
  if (code === undefined) return [];
  return [
    programStore.seed({
      pendingExample: {
        id: example.id,
        language,
        name: example.id,
        // the same normalisation `openFile` does, since this bypasses it: some
        // of the example corpus is stored with CRLF line endings
        code: code.trim().replace(/\r\n/g, "\n"),
      },
    }),
  ];
};
