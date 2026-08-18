import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  customTags,
  FAILED_TO_RENDER,
  islandNames,
  renderRoute,
  ROUTES,
  settingAttributes,
  settingsNamed,
} from "./_render.ts";
import { isSettingName } from "@/islands/settings.ts";

// The failure-mode sweep: one pass over every route, asserting the things that
// go wrong *silently* in a Womble page. None of these asserts any particular
// content - that's the job of system.test.ts and reference.test.ts below. What
// they cover is the class of regression that leaves a page looking fine at a
// glance and a component missing, unhydrated, or inert.

const ISLANDS = await islandNames();

describe("every route", () => {
  for (const route of ROUTES) {
    describe(`${route.name} (${route.path})`, () => {
      it("responds with a page", async () => {
        const { status, markup } = await renderRoute(route.path);
        assertEquals(status, route.path === "/no/such/page" ? 404 : 200);
        assertStringIncludes(markup, "<html>");
        assertStringIncludes(markup, "</html>");
      });

      // An island whose props fail to parse or validate is replaced by an
      // HTML comment naming it. The page still renders, still responds 200,
      // and is missing a component - so a test that only looks for what
      // should be there can pass against a page that lost half of itself.
      it("expands every island", async () => {
        const { markup } = await renderRoute(route.path);
        assertEquals(
          markup.includes(FAILED_TO_RENDER),
          false,
          `an island failed to render: ${markup
            .slice(markup.indexOf(FAILED_TO_RENDER) - 40)
            .slice(0, 120)}`,
        );
      });

      // Rule 6 (test/README.md). Womble degrades rather than throws: an island
      // whose props don't parse, a prop that doesn't match its declared type,
      // an unknown `on-<event>` - all of them render *something* and report it
      // only through the log sink.
      it("renders without Womble reporting anything", async () => {
        const { logs } = await renderRoute(route.path);
        assertEquals(
          logs.map((entry) => `[${entry.kind}] ${entry.message}`),
          [],
        );
      });

      // Womble leaves an unregistered custom-element tag exactly where it
      // found it, so a typo'd tag name, or a route that renders a tag whose
      // module it forgot to import, produces an inert element and no other
      // sign of anything wrong.
      it("renders only tags some island defines", async () => {
        const { markup } = await renderRoute(route.path);
        const unknown = Array.from(customTags(markup)).filter(
          (tag) => !ISLANDS.has(tag),
        );
        assertEquals(unknown, []);
      });

      // A settings control is addressed by a name written by hand in an HTML
      // attribute, and a typo in one is invisible: the control renders with
      // `undefined` for its value - a checkbox unchecked, a number input blank -
      // and writes a setting nothing reads if a user happens to touch it. There
      // is no type that can catch it (the name is an attribute), but every one
      // of the ~40 call sites ends up here, in markup the server sent, so a
      // sweep can.
      it("addresses only settings that exist", async () => {
        const { markup } = await renderRoute(route.path);
        const unknown = Array.from(settingsNamed(markup)).filter(
          (name) => !isSettingName(name),
        );
        assertEquals(unknown, []);
      });
    });
  }
});

// ...and the sweep above is only worth as much as its reach, which this pins.
// A control that no route renders would be checked by nothing, and the sweep
// would go on passing.
describe("the settings controls", () => {
  it("are all reachable from some route", async () => {
    const rendered = new Set<string>();
    for (const route of ROUTES) {
      const { markup } = await renderRoute(route.path);
      for (const name of settingsNamed(markup)) rendered.add(name);
    }
    // Real settings only: the source scan can't tell a call site from an
    // example in a doc comment, and a made-up name in a comment must not fail
    // this. A typo in real markup is the other test's job, and it can only
    // reach a user through a route anyway.
    const written = Array.from(await settingAttributes()).filter(isSettingName);
    assertEquals(written.filter((name) => !rendered.has(name)).sort(), []);
    assertEquals(written.length > 0, true);
  });
});

describe("/documentation", () => {
  it("redirects to the first documentation page", async () => {
    const { status } = await renderRoute("/documentation");
    assertEquals(status, 302);
  });
});
