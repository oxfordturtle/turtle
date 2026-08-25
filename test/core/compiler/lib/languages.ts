import { languages } from "@/core/constants.ts";

/**
 * Every language the compiler supports, sourced from the `languages`
 * constant (rather than duplicated by hand) so this list can't drift from
 * `@/core/constants.ts`'s `Language` union.
 *
 * Later test files should loop over this for behavior that's common across
 * languages, rather than writing six near-identical `it(...)` blocks —
 * reserve per-language `it`s for genuinely divergent syntax.
 */
export const LANGUAGES = languages;
