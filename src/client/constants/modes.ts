export type Mode = (typeof modes)[number];

const modes = ["simple", "normal", "expert", "machine"] as const;

export default modes;
