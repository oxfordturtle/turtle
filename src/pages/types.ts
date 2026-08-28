// deno-coverage-ignore-file -- type declarations only: erased at compile time, so no
// test can ever load this module at runtime.

import type { CookieValues } from "@/client/constants/properties.ts";

export type RequestParams = {
  method: string;
  url: URL;
  sections: [string, ...string[]];
  page: string;
  formData?: FormData;
  /**
   * The five settings this request's cookie could be read for, as a partial: a
   * field the cookie didn't carry is one the layout falls back to a default for.
   * This is the whole of what the server knows about who is asking, and it is
   * what lets the first render be right rather than corrected - see
   * `cookieFields` in src/client/constants/properties.ts.
   */
  settings: Partial<CookieValues>;
};
