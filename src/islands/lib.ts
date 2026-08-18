// The rules every island in this directory keeps - all of which fail silently
// apart from a console line - are in src/README.md, under "Womble".

/**
 * Joins class names, dropping the falsy ones. A partial hole
 * (`class="a ${open ? "open" : ""}"`) works in `html` too; this earns its place
 * only where several names need dropping.
 */
export const classes = (
  ...names: Array<string | false | null | undefined>
): string => names.filter(Boolean).join(" ");
