import {
  assertEquals,
  assertFalse,
  assertMatch,
  assertStringIncludes,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { html } from "@merivale/womble";
import router from "@/pages/router.ts";
import parseRequest from "@/pages/router/parseRequest.ts";
import errorPage from "@/pages/error.ts";
import { fileResponse, jsonResponse } from "@/pages/utils/response.ts";
import { safely, safelyOptional, withLogging } from "@/pages/utils/tools.ts";
import { code } from "@/pages/documentation/reference/notes/lib.ts";
import { renderRoute } from "./lib/render.ts";

// The server plumbing around the routes routes.test.ts sweeps: what the router
// does with a request that isn't a happy-path GET for a page - assets, POSTs,
// redirects, errors - and the small helpers those paths run on. Everything here
// drives the real router with a constructed Request wherever a URL can reach
// the behaviour; only things no URL reaches (the 400/403/405/500 error pages,
// the unused tool exports) are called directly.

const request = (path: string, init?: RequestInit): Request =>
  new Request(`http://localhost${path}`, init);

/** RequestParams built the way the router builds them, for direct page calls. */
const paramsFor = (path: string, init?: RequestInit) =>
  parseRequest(request(path, init));

/** Runs `cb` with console.log captured, so a logging assert doesn't spam the run. */
const capturingLog = <T>(cb: () => T): { result: T; logged: unknown[] } => {
  const logged: unknown[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => logged.push(...args);
  try {
    return { result: cb(), logged };
  } finally {
    console.log = original;
  }
};

describe("the asset routes", () => {
  // The charset-bearing media types belong to assets/build/, which holds build
  // output and is not in the repo - so serving the real screen.css through the
  // router would pass here and 404 on a fresh clone or on CI, where
  // coverage:check runs before build. fileResponse derives the type, charset
  // and filename from the path alone, so a fixture pins them without a file on
  // disk; the two tests below drive the same function through the router with
  // assets that are committed.
  it("names a stylesheet with its type, charset and filename", async () => {
    const response = await fileResponse(
      "body { margin: 0 }",
      "./assets/build/screen.css",
    );
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "text/css; charset=UTF-8",
    );
    assertEquals(
      response.headers.get("content-disposition"),
      "inline; filename=screen.css",
    );
    assertEquals(await response.text(), "body { margin: 0 }");
  });

  it("serves an image with its media type", async () => {
    const response = await router(request("/images/favicon.ico"));
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "image/vnd.microsoft.icon",
    );
    assertEquals(
      (await response.bytes()).length,
      (await Deno.readFile("assets/images/favicon.ico")).length,
    );
  });

  // The example programs' extensions (.tbas etc.) mean nothing to the
  // media-types registry, which is exactly what the octet-stream fallback in
  // fileResponse is for.
  it("serves an unknown extension as an octet stream", async () => {
    const response = await router(
      request("/examples/BASIC/Drawing/Circles.tbas"),
    );
    assertEquals(response.status, 200);
    assertEquals(
      response.headers.get("content-type"),
      "application/octet-stream",
    );
    assertEquals(
      response.headers.get("content-disposition"),
      "inline; filename=Circles.tbas",
    );
    assertEquals(
      await response.text(),
      await Deno.readTextFile("assets/examples/BASIC/Drawing/Circles.tbas"),
    );
  });

  it("answers a missing asset with the 404 page", async () => {
    const response = await router(request("/build/no-such-file.js"));
    assertEquals(response.status, 404);
    assertEquals(response.headers.get("content-type"), "text/html");
    assertStringIncludes(await response.text(), "<h1>Not Found</h1>");
  });

  // Deno.readFile throws on a directory; asafelyOptional turns that into the
  // same 404 as a missing file, rather than a crashed request.
  it("answers a directory path with the 404 page", async () => {
    const response = await router(request("/build"));
    assertEquals(response.status, 404);
  });
});

describe("the request parser", () => {
  it("reads / as the index page", async () => {
    const params = await paramsFor("/");
    assertEquals(params.method, "GET");
    assertEquals(params.sections, ["index"]);
    assertEquals(params.page, "index");
  });

  it("splits a nested path and names its page after the second section", async () => {
    const params = await paramsFor("/documentation/help");
    assertEquals(params.sections, ["documentation", "help"]);
    assertEquals(params.page, "help");
  });

  it("ignores empty path segments", async () => {
    const params = await paramsFor("/documentation//help/");
    assertEquals(params.sections, ["documentation", "help"]);
  });

  it("parses the form data a POST carries", async () => {
    const body = new FormData();
    body.append("filename", "spiral.tbas");
    const params = await paramsFor("/", { method: "POST", body });
    assertEquals(params.method, "POST");
    assertEquals(params.formData?.get("filename"), "spiral.tbas");
  });

  // request.formData() rejects on a bodiless GET; asafelyOptional makes that
  // "no form data" rather than an error.
  it("leaves formData undefined on a GET", async () => {
    const params = await paramsFor("/about");
    assertEquals(params.formData, undefined);
  });
});

describe("a POST to a page route", () => {
  // No route reads a request body yet, so the observable behaviour is that the
  // body is consumed harmlessly and the page comes back as usual. (error.ts
  // has a 405 page, but nothing produces it - see the error pages below.)
  it("gets the page, not an error", async () => {
    const body = new FormData();
    body.append("name", "turtle");
    const response = await router(request("/", { method: "POST", body }));
    assertEquals(response.status, 200);
    assertStringIncludes(await response.text(), "<turtle-system ");
  });
});

describe("the documentation router", () => {
  it("redirects bare /documentation to the first documentation page", async () => {
    const response = await router(request("/documentation"));
    assertEquals(response.status, 302);
    assertEquals(
      response.headers.get("location"),
      "http://localhost/documentation/help",
    );
    assertEquals(await response.text(), "");
  });

  it("answers an unknown documentation section with the 404 page", async () => {
    const { status, markup } = await renderRoute(
      "/documentation/no-such-section",
    );
    assertEquals(status, 404);
    assertStringIncludes(markup, "<h1>Not Found</h1>");
  });

  it("activates the tab ?tab= names on the help page", async () => {
    const { status, markup } = await renderRoute(
      "/documentation/help?tab=input",
    );
    assertEquals(status, 200);
    assertStringIncludes(
      markup,
      '<div class="tab-pane active" data-tab="input">',
    );
    assertStringIncludes(markup, '<div class="tab-pane" data-tab="basics">');
  });
});

describe("the error pages", () => {
  it("send the 404 page with its explanation", async () => {
    const { status, markup } = await renderRoute("/no/such/page");
    assertEquals(status, 404);
    assertStringIncludes(markup, "<h1>Not Found</h1>");
    assertStringIncludes(markup, "This page could not be found.");
  });

  // Nothing in the router produces 400, 403, 405 or 500 today (the 500 branch
  // is unreachable - see src/pages/router.ts) - these pages are kept for
  // handlers that will need them, so they are pinned by direct call.
  it("send Bad Request as a full page", async () => {
    const response = await errorPage(await paramsFor("/"), 400);
    assertEquals(response.status, 400);
    assertEquals(response.headers.get("content-type"), "text/html");
    const markup = await response.text();
    assertStringIncludes(markup, "<h1>Bad Request</h1>");
    assertStringIncludes(markup, "The data you sent doesn't make sense.");
  });

  it("send Login Required as a full page", async () => {
    const response = await errorPage(await paramsFor("/"), 403);
    assertEquals(response.status, 403);
    const markup = await response.text();
    assertStringIncludes(markup, "<h1>Login Required</h1>");
    assertStringIncludes(markup, "This page is for registered users only.");
  });

  it("send Method not Allowed as a full page", async () => {
    const response = await errorPage(await paramsFor("/"), 405);
    assertEquals(response.status, 405);
    const markup = await response.text();
    assertStringIncludes(markup, "<h1>Method not Allowed</h1>");
    assertStringIncludes(markup, "This method is not allowed at this URL.");
  });

  it("send Internal Server Error as a full page", async () => {
    const response = await errorPage(await paramsFor("/"), 500);
    assertEquals(response.status, 500);
    const markup = await response.text();
    assertStringIncludes(markup, "<h1>Internal Server Error</h1>");
    assertStringIncludes(markup, "Something went wrong.");
  });
});

describe("routes named after Object.prototype members", () => {
  // The handler tables in router/response.ts and documentation.ts are plain
  // object literals, and their `handler[name] ? ...` check finds inherited
  // members. `__proto__` happens to be safe only because Deno deletes the
  // Object.prototype.__proto__ accessor.
  it("answer /__proto__ with the 404 page", async () => {
    const { status, markup } = await renderRoute("/__proto__");
    assertEquals(status, 404);
    assertStringIncludes(markup, "<h1>Not Found</h1>");
  });

  // [known limitation] The right answer is the 404 page, but `/toString` finds
  // Object.prototype.toString in the handler table and the router sends its
  // return value - the string "[object Object]", not a Response - so a real
  // Deno.serve drops the connection instead of responding. Same class of hole:
  // /constructor, /valueOf, /hasOwnProperty, and the documentation table's
  // /documentation/toString etc. The fix would be null-prototype tables or an
  // Object.hasOwn check; fixing it should trip this test.
  it("[known limitation] answers /toString with a non-Response", async () => {
    const result = await router(request("/toString"));
    assertFalse(result instanceof Response);
    assertEquals(String(result), "[object Object]");
  });
});

describe("the response helpers", () => {
  // No route sends JSON today: jsonResponse is exported but uncalled outside
  // this test. Pinned here so it still works when a route needs it; if it's
  // removed instead, this block goes with it.
  it("jsonResponse sends its object as JSON, 200 by default", async () => {
    const response = await jsonResponse({ compiled: true, errors: [] });
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("content-type"), "application/json");
    assertEquals(await response.json(), { compiled: true, errors: [] });
  });

  it("jsonResponse takes an explicit status", async () => {
    const response = await jsonResponse({ error: "no such program" }, 404);
    assertEquals(response.status, 404);
  });

  it("every response is stamped with a date header", async () => {
    const response = await router(request("/about"));
    assertMatch(response.headers.get("date") ?? "", /GMT$/);
  });

  // The content-disposition filename is fileResponse's alone: a page response
  // is a document, not a download.
  it("page responses carry no content-disposition", async () => {
    const response = await router(request("/about"));
    assertEquals(response.headers.get("content-type"), "text/html");
    assertEquals(response.headers.get("content-disposition"), null);
  });
});

describe("the layout", () => {
  it("leaves the header element empty for a page without one", async () => {
    const { markup } = await renderRoute("/");
    assertStringIncludes(markup, '<header class="header"></header>');
  });

  it("puts a page's header content inside the header element", async () => {
    const { markup } = await renderRoute("/about");
    const header = markup.slice(
      markup.indexOf('<header class="header">'),
      markup.indexOf("</header>"),
    );
    assertStringIncludes(header, "<h1>About the Turtle System</h1>");
  });

  it("puts the site footer on every page", async () => {
    const { markup } = await renderRoute("/contact");
    assertStringIncludes(markup, '<div class="logos-list">');
    assertStringIncludes(markup, "The Oxford Turtle Project is funded by the");
  });

  it("classes the body after the route's first section", async () => {
    assertStringIncludes(
      (await renderRoute("/")).markup,
      '<body class="index">',
    );
    assertStringIncludes(
      (await renderRoute("/documentation/help")).markup,
      '<body class="documentation">',
    );
  });

  it("seeds the settings store from ?l=", async () => {
    const { markup } = await renderRoute("/?l=BASIC");
    assertStringIncludes(
      markup,
      '<script type="application/json" data-womble-stores>' +
        '{"settings":{"language":"BASIC"}}</script>',
    );
  });

  // languageFromUrl is the one home for the rule, so a bogus ?l= serves
  // byte-for-byte the page the bare URL serves.
  it("seeds nothing from an ?l= naming no language", async () => {
    const plain = await renderRoute("/");
    const bogus = await renderRoute("/?l=Elvish");
    assertEquals(bogus.status, 200);
    assertEquals(bogus.markup, plain.markup);
  });
});

describe("the code() spelling helper", () => {
  // The string form, through a real route: the colours note writes
  // code("colour") and code("rgb(3)"), and the reference page ships all six
  // spellings for the languageVisibility pass to show and hide.
  it("spells a command six ways on the reference page", async () => {
    const { markup } = await renderRoute(
      "/documentation/reference?tab=colours",
    );
    assertStringIncludes(markup, '<code data-language="BASIC">COLOUR</code>');
    assertStringIncludes(markup, '<code data-language="Pascal">colour</code>');
    assertStringIncludes(
      markup,
      '<code data-language="TypeScript">colour</code>',
    );
    assertStringIncludes(markup, '<code data-language="BASIC">RGB(3)</code>');
  });

  // The record form exists for names that diverge beyond capitalisation
  // (PRINT is writeln in Pascal). No note passes one yet, so it's pinned by
  // direct call rather than through a route.
  it("uses the given spellings when passed a record", () => {
    const markup = String(
      html`${code({
        BASIC: "PRINT",
        C: "print",
        Java: "print",
        Pascal: "writeln",
        Python: "print",
        TypeScript: "print",
      })}`,
    );
    assertStringIncludes(markup, '<code data-language="BASIC">PRINT</code>');
    assertStringIncludes(markup, '<code data-language="Pascal">writeln</code>');
    assertStringIncludes(markup, '<code data-language="Python">print</code>');
  });
});

// safely, safelyOptional and withLogging have no callers anywhere in src/ or
// app.ts (the router uses only their async twins). They are pinned here as the
// sync halves of the tools module's public surface; if they are dropped
// instead, this block goes with them.
describe("the sync tools", () => {
  it("safely wraps a value as right", () => {
    assertEquals(
      safely(() => 6 * 7),
      ["right", 42],
    );
  });

  it("safely wraps a throw as left, with the error", () => {
    const result = safely(() => {
      throw new Error("no such turtle");
    });
    assertEquals(result[0], "left");
    assertEquals((result[1] as Error).message, "no such turtle");
  });

  it("safelyOptional passes a value through", () => {
    assertEquals(
      safelyOptional(() => "fill"),
      "fill",
    );
  });

  it("safelyOptional turns a throw into undefined", () => {
    assertEquals(
      safelyOptional(() => {
        throw new Error("nope");
      }),
      undefined,
    );
  });

  it("withLogging logs its argument and returns it unchanged", () => {
    const { result, logged } = capturingLog(() => withLogging("pcode dump"));
    assertEquals(result, "pcode dump");
    assertEquals(logged, ["pcode dump"]);
  });
});
