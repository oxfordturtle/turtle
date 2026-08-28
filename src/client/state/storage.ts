/// <reference lib="dom" />
import {
  cookieFields,
  type CookieValues,
  defaults,
  type Property,
  type PropertyValues,
} from "../constants/properties.ts";
import { COOKIE_NAME, serialiseCookie } from "./cookie.ts";

/**
 * Where a persisted value lives in the browser: `localStorage`, plus - for the
 * five properties the *server* has to know - a mirror in a cookie.
 *
 * **`localStorage`, not `sessionStorage`.** A student's settings and their open
 * files should survive closing the tab. The cost is that two tabs share one file
 * memory rather than being two independent systems; that is the trade that was
 * taken.
 *
 * **The cookie is a mirror, never a source.** `load` reads `localStorage` only.
 * The cookie exists so that the first render the server sends is already right,
 * which is the whole of its job. The format lives in ./cookie.ts, so the server
 * can read what this writes.
 */

export function load<P extends Property>(property: P): PropertyValues[P] {
  const fromStorage = localStorage.getItem(property);
  return fromStorage !== null ? JSON.parse(fromStorage) : defaults[property];
}

export function save<P extends Property>(
  property: P,
  value: PropertyValues[P],
): void {
  localStorage.setItem(property, JSON.stringify(value));
  // the five the server renders differently for; everything else is invisible
  // to it and stays in `localStorage` alone
  if ((cookieFields as readonly string[]).includes(property)) writeCookie();
}

/**
 * The whole cookie, rewritten from `localStorage`. Rewriting all five rather
 * than patching one is what keeps it from drifting: there is one place the
 * cookie's contents are decided, and it is `cookieFields`.
 *
 * The client entry calls this once at startup too, so a browser that has
 * settings but no cookie - one that stored them before the cookie existed, or
 * one whose cookie has expired - gets a correct one on its next page load.
 */
export const writeCookie = (): void => {
  const values = Object.fromEntries(
    cookieFields.map((field) => [field, load(field)]),
  ) as CookieValues;
  // Lax rather than Strict: following a link into the system from a worksheet
  // or a VLE should still arrive with the right settings. A year, because these
  // are preferences rather than a session.
  document.cookie = `${COOKIE_NAME}=${serialiseCookie(
    values,
  )}; path=/; max-age=31536000; samesite=lax`;
};

/**
 * Whether anything has ever been stored under a property, as opposed to `load`
 * falling back to its default. The language rule in src/islands/settings.ts
 * needs the difference: a browser with nothing stored is one whose first file is
 * still to be made, and so one a link's `?l=` may speak for.
 */
export const isStored = (property: Property): boolean =>
  localStorage.getItem(property) !== null;
