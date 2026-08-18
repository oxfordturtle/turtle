import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import { extension, languages, trueValue } from "@/core/constants.ts";

describe("languages", () => {
  it("lists the six supported languages", () => {
    assertEquals(languages, [
      "BASIC",
      "C",
      "Java",
      "Pascal",
      "Python",
      "TypeScript",
    ]);
  });

  it("gives every language a file extension, matching the real example assets", () => {
    // assets/examples/<Language>/**/*.<extension> is where example programs
    // actually live on disk (see examples.test.ts) -- these must stay in
    // sync or example lookup breaks silently.
    assertEquals(extension, {
      BASIC: "tbas",
      C: "tc",
      Java: "tjav",
      Pascal: "tpas",
      Python: "tpy",
      TypeScript: "tts",
    });
  });

  it("gives every language a Boolean true value of 1 or -1", () => {
    for (const language of languages) {
      const value = trueValue[language];
      assertEquals(value === 1 || value === -1, true, `${language}: ${value}`);
    }
  });
});
