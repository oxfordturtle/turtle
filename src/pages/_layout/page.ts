import {
  html,
  type HtmlResult,
  type StoreSeed,
  storeSeeds,
  withStores,
} from "@merivale/womble";
import {
  asLanguage,
  languageFromUrl,
  resolveLanguage,
  type Settings,
  settingsStore,
} from "@/islands/settings.ts";
import { defaults } from "@/client/constants/properties.ts";
import type { Language } from "@/core/constants.ts";
import type { RequestParams } from "../types.ts";
import "@/islands/site-menu.ts";

// The whole page, as one `html` template, which is what lets island expansion
// happen exactly once, at the `String(...)` below.
//
// **The `withStores` wrapper seeds the settings store per request.** A
// module-level store is process-global on a server, so without a scope one
// request's value would be every request's. Two things about it are
// load-bearing:
//
//  - **The scope wraps the `String(...)`, not the `html` call.** Island
//    expansion - and so every component's `render`, and so every
//    `getSettings()` - happens at that stringification. The corollary is what a
//    future refactor could break silently: anything that stringifies markup
//    outside this function renders outside the scope, and is served the store's
//    module defaults.
//  - **The callback must stay synchronous.** The scope is a stack unwound in a
//    `finally`, so it lasts exactly as long as the call. Every `await` in
//    src/pages/ is outside this block, and has to stay there.
//
// `${storeSeeds()}` in the `<head>` is the other half: the seeded fields as one
// inert JSON script, which the store adopts on its first read in the browser, so
// the first paint matches the markup the server sent.
//
// **`<body>` carries the two facts no component owns.** `data-language` is what
// the stylesheet keys the documentation prose off, so the guides for the other
// five languages arrive hidden rather than being hidden afterwards; and
// `fullscreen` is a class on `<body>` because that is where the layout CSS
// expects it. Both are re-asserted by src/client/passes.ts when a person changes
// them, which is a change rather than a correction.
//
// The `<header>`/`<main>`/`<footer>` elements belong to the layout - every page
// has exactly one of each, and the stylesheet expects them. A page supplies only
// their *contents*, as named slots; naming them stops two same-typed arguments
// being passed in the wrong order.
export type Content = {
  // `null` renders nothing in a hole, which is how the system page - the one
  // page with no header - supplies its absence
  header?: HtmlResult | null;
  main: HtmlResult;
  /**
   * Anything this route has to say to a store beyond the settings. Only the
   * system page uses it, to hand the program store the example a `?x=` link
   * asked for - see src/pages/index.ts.
   */
  seeds?: StoreSeed[];
};

export default (
  requestParams: RequestParams,
  { header = null, main, seeds = [] }: Content,
): string =>
  withStores([...seedsFor(requestParams), ...seeds], () =>
    String(html`
      <html>
        <head>
          <meta charset="utf-8" />
          <meta http-equiv="X-UA-Compatible" content="IE=edge" />
          <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta
            name="keywords"
            content="turtle graphics, programming, coding, education, learn to code"
          />
          <meta
            name="description"
            content="The Turtle System is a free educational program developed at the University of Oxford, designed to support the Computer Science component of the UK National Curriculum."
          />
          <meta name="theme-color" content="#159d6b" />
          <link rel="icon" type="image/x-icon" href="/images/favicon.ico" />
          <link rel="apple-touch-icon" href="/images/turtle-152x152.png" />
          <link href="/build/screen.css" rel="stylesheet" />
          <title>The Turtle System</title>
          ${storeSeeds()}
          <script defer src="/build/index.js"></script>
        </head>
        <body
          class="${bodyClass(requestParams)}"
          data-language="${seededSettings(requestParams).language}"
        >
          <nav class="site-nav">
            <div class="site-nav-left">
              <site-menu
                section="${requestParams.sections[0]}"
                page="${requestParams.page}"
              />
            </div>
          </nav>
          <div class="wrapper">
            <div class="container">
              <header class="header">${header}</header>
              <main class="main">${main}</main>
              <footer class="footer">${footer}</footer>
            </div>
          </div>
        </body>
      </html>
    `),
  );

/**
 * The stores this request has something to say to, and what it says: the five
 * settings the cookie carries, with the language resolved over the top of them.
 *
 * That is everything a page's markup varies by. The ~19 machine and compiler
 * options vary it too, but only inside a closed submenu or an inactive tab, so
 * they are deliberately not in the cookie and the store's defaults are the
 * honest answer for them - see `cookieFields`.
 *
 * A seed is a `Partial`, so a request with no cookie at all seeds only the
 * language and the store keeps its own defaults for the rest.
 */
const seedsFor = (requestParams: RequestParams): StoreSeed[] => [
  settingsStore.seed(seededSettings(requestParams)),
];

/**
 * The cookie's settings with `resolveLanguage`'s answer over them. Called twice
 * per render - once for the seed, once for `<body data-language>` - and cheap
 * enough that sharing it would cost more than it saved.
 */
const seededSettings = (
  requestParams: RequestParams,
): Partial<Settings> & { language: string } => ({
  ...requestParams.settings,
  language: resolveLanguage({
    url: languageFromUrl(requestParams.url.searchParams),
    stored: asLanguage(requestParams.settings.language),
    // the system app is the index route; every other route is documentation or
    // static prose, where `?l=` is a view parameter and wins outright
    system: requestParams.sections[0] === "index",
    example: requestParams.url.searchParams.get("x") !== null,
  }),
});

/**
 * The language this request settled on. Exported because the system route needs
 * it before it can read an example off disk - the same example is a different
 * file in each of the six languages.
 */
export const languageFor = (requestParams: RequestParams): Language =>
  seededSettings(requestParams).language as Language;

/**
 * The route name, which the stylesheet scopes each page's rules by, plus
 * `fullscreen` when that preference is set - the layout CSS is `.index
 * .fullscreen`, so it is inert on every other route.
 */
const bodyClass = (requestParams: RequestParams): string => {
  const fullscreen = requestParams.settings.fullscreen ?? defaults.fullscreen;
  return fullscreen
    ? `${requestParams.sections[0]} fullscreen`
    : requestParams.sections[0];
};

const footer = html`
  <div class="logos-list">
    <a
      href="http://www.cs.ox.ac.uk/"
      target="blank"
      title="Department of Computer Science, University of Oxford"
      ><img
        src="/images/computer-science-logo.png"
        alt="Department of Computer Science Logo, University of Oxford"
    /></a>
    <a
      href="http://www.philosophy.ox.ac.uk/"
      target="blank"
      title="Philosophy Faculty, University of Oxford"
      ><img
        src="/images/philosophy-logo.jpg"
        alt="Philosophy Faculty Logo, University of Oxford"
    /></a>
    <a
      href="https://www.gov.uk/government/organisations/department-for-education"
      target="blank"
      title="The Department for Education"
      ><img
        src="/images/government-logo.png"
        alt="The Department for Education Crest"
    /></a>
    <a
      href="http://www.hertford.ox.ac.uk/"
      target="blank"
      title="Hertford College"
      ><img src="/images/hertford-logo.png" alt="Hertford College Crest"
    /></a>
  </div>
  <p class="acknowledgements">
    The Oxford Turtle Project is funded by the
    <a
      href="https://www.gov.uk/government/organisations/department-for-education"
      target="blank"
      >UK Department for Education</a
    >, with matched funding from various sources within the University of Oxford
    (the
    <a href="http://www.cs.ox.ac.uk/" target="blank"
      >Department of Computer Science</a
    >, the
    <a
      href="http://www.admin.ox.ac.uk/councilsec/trusts/applying/vanhoutenfund/"
      target="blank"
      >Van Houten Fund</a
    >, and a private donor at
    <a href="http://www.hertford.ox.ac.uk/" target="blank">Hertford College</a
    >). It is housed in the University of Oxford&rsquo;s
    <a href="http://www.philosophy.ox.ac.uk/" target="blank"
      >Faculty of Philosophy</a
    >.
  </p>
`;
