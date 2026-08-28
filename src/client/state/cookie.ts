import {
  type CookieField,
  cookieFields,
  type CookieValues,
  defaults,
} from "../constants/properties.ts";

/**
 * The cookie's format, written once and read from both sides: the browser writes
 * it (src/client/state/storage.ts) and the server reads it
 * (src/pages/router/parseRequest.ts), so the two cannot disagree about the shape
 * of it.
 *
 * **No DOM, no `document.cookie`.** This module is pure string handling, which
 * is what lets the server import it. Actually setting the cookie is
 * `storage.ts`'s job, and it is the only writer: the server never sends a
 * `Set-Cookie`, so no response has to vary on having produced one.
 *
 * The format is `turtle=name:value|name:value|…`, values percent-encoded. Five
 * short fields, about forty-five bytes in all - see `cookieFields`.
 */

export const COOKIE_NAME = "turtle";

/** The five values as the cookie's own value (no name, no attributes). */
export const serialiseCookie = (values: CookieValues): string =>
  cookieFields
    .map((field) => `${field}:${encodeURIComponent(String(values[field]))}`)
    .join("|");

/**
 * Whatever a request's `cookie` header can be made to yield, as a partial - a
 * field this can't read is one the caller should fall back to a default for,
 * which is what makes an absent, truncated or hand-edited cookie harmless.
 *
 * Each value is coerced to the type its default already has, so adding a field
 * to `cookieFields` needs no change here.
 */
export const parseCookie = (header: string | null): Partial<CookieValues> => {
  const values: Partial<CookieValues> = {};
  if (!header) return values;
  const cookie = header
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return values;
  for (const pair of cookie.slice(COOKIE_NAME.length + 1).split("|")) {
    const separator = pair.indexOf(":");
    if (separator === -1) continue;
    const name = pair.slice(0, separator);
    if (!isCookieField(name)) continue;
    const parsed = coerce(name, decodeURIComponent(pair.slice(separator + 1)));
    if (parsed !== undefined) write(values, name, parsed);
  }
  return values;
};

const isCookieField = (name: string): name is CookieField =>
  (cookieFields as readonly string[]).includes(name);

/**
 * A cookie carries strings; the property it stands for may be a boolean or a
 * number. The default's own type is what says which, so this stays correct as
 * `cookieFields` changes. `undefined` means "unreadable, use the default".
 */
const coerce = (
  field: CookieField,
  value: string,
): string | number | boolean | undefined => {
  switch (typeof defaults[field]) {
    case "boolean":
      return value === "true" ? true : value === "false" ? false : undefined;
    case "number": {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    default:
      return value;
  }
};

// A write whose key is a variable: the same trick src/islands/settings.ts uses,
// for the same reason - `values[field] = parsed` type-checks only where the name
// is a type parameter rather than the `CookieField` union.
const write = <F extends CookieField>(
  values: Partial<CookieValues>,
  field: F,
  value: string | number | boolean,
): void => {
  values[field] = value as CookieValues[F];
};
