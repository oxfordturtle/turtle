export interface Colour {
  readonly index: number;
  readonly names: {
    readonly BASIC: string;
    readonly C: string;
    readonly Java: string;
    readonly Pascal: string;
    readonly Python: string;
    readonly TypeScript: string;
  };
  readonly value: number;
  readonly hex: string;
  readonly dark: boolean;
}

const colour = (
  index: number,
  name: string,
  value: number,
  dark: boolean,
): Colour => ({
  index,
  names: {
    BASIC: name.toUpperCase(),
    C: name,
    Java: name,
    Pascal: name,
    Python: name,
    TypeScript: name,
  },
  value,
  hex: value.toString(16).padStart(6, "0").toUpperCase(),
  dark,
});

export const colours = [
  colour(1, "green", 0x228b22, true),
  colour(2, "red", 0xff0000, true),
  colour(3, "blue", 0x0000ff, true),
  colour(4, "yellow", 0xffff00, false),
  colour(5, "violet", 0x8a2be2, true),
  colour(6, "lime", 0x00ff00, false),
  colour(7, "orange", 0xffaa00, false),
  colour(8, "skyblue", 0x00b0ff, true),
  colour(9, "brown", 0x964b00, true),
  colour(10, "pink", 0xee1289, true),
  colour(11, "darkgreen", 0x006400, true),
  colour(12, "darkred", 0xb22222, true),
  colour(13, "darkblue", 0x000080, true),
  colour(14, "ochre", 0xc0b030, true),
  colour(15, "indigo", 0x4b0082, true),
  colour(16, "olive", 0x808000, true),
  colour(17, "orangered", 0xff6600, true),
  colour(18, "teal", 0x008080, true),
  colour(19, "darkbrown", 0x5c4033, true),
  colour(20, "magenta", 0xff00ff, true),
  colour(21, "lightgreen", 0x98fb98, false),
  colour(22, "lightred", 0xcd5c5c, true),
  colour(23, "lightblue", 0x99bbff, false),
  colour(24, "cream", 0xffffbb, false),
  colour(25, "lilac", 0xb093ff, true),
  colour(26, "yellowgreen", 0xaacc33, false),
  colour(27, "peach", 0xffccb0, false),
  colour(28, "cyan", 0x00ffff, false),
  colour(29, "lightbrown", 0xb08050, true),
  colour(30, "lightpink", 0xffb6c1, false),
  colour(31, "seagreen", 0x3cb371, true),
  colour(32, "maroon", 0x800000, true),
  colour(33, "royal", 0x4169e1, true),
  colour(34, "gold", 0xffc800, false),
  colour(35, "purple", 0x800080, true),
  colour(36, "emerald", 0x00c957, true),
  colour(37, "salmon", 0xfa8072, true),
  colour(38, "turquoise", 0x00bec1, true),
  colour(39, "coffee", 0x926f3f, true),
  colour(40, "rose", 0xff88aa, true),
  colour(41, "greengrey", 0x709070, true),
  colour(42, "redgrey", 0xb08080, true),
  colour(43, "bluegrey", 0x8080a0, true),
  colour(44, "yellowgrey", 0x909070, true),
  colour(45, "darkgrey", 0x404040, true),
  colour(46, "midgrey", 0x808080, true),
  colour(47, "lightgrey", 0xa0a0a0, true),
  colour(48, "silver", 0xc0c0c0, false),
  colour(49, "white", 0xffffff, false),
  colour(50, "black", 0x000000, true),
] as const;
