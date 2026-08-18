export interface Font {
  readonly __: "Font";
  readonly index: number;
  readonly name: string;
  readonly css: string;
}

const font = (index: number, name: string, css: string): Font => ({
  __: "Font",
  index,
  name,
  css,
});

export const fonts = [
  font(0x0, "Arial", "Arial, sans-serif"),
  font(0x1, "Arial Black", '"Arial Black", sans-serif'),
  font(0x2, "Arial Narrow", '"Arial Narrow", sans-serif'),
  font(0x3, "Bookman Old Style", '"Bookman Old Style", serif'),
  font(0x4, "Comic Sans MS", '"Comic Sans MS", cursive, sans-serif'),
  font(0x5, "Courier New", '"Courier New", Courier, monospace'),
  font(0x6, "Georgia", "Georgia, serif"),
  font(0x7, "Lucida Bright", '"Lucida Bright", serif'),
  font(0x8, "Lucida Calligraphy", '"Lucida Calligraphy", cursive, serif'),
  font(0x9, "Lucida Handwriting", '"Lucida Handwriting", cursive, serif'),
  font(0xa, "Lucida Sans", '"Lucida Sans Unicode", sans-serif'),
  font(0xb, "Lucida Sans Typewriter", '"Lucida Sans Typewriter", sans-serif'),
  font(0xc, "Old English Text MT", '"Old English Text MT", serif'),
  font(0xd, "Symbol", "Symbol"),
  font(0xe, "Times New Roman", '"Times New Roman", Times, serif'),
  font(0xf, "Verdana", "Verdana, Geneva, sans-serif"),
] as const;
