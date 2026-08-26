/** formats a colour value as the six-digit hex string the ports expect */
export const hex = (colour: number): string =>
  `#${padded(colour.toString(16))}`;

const padded = (string: string): string =>
  string.length < 6 ? padded(`0${string}`) : string;
