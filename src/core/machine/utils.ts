export class MachineError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export const hex = (colour: number): string => {
  return `#${padded(colour.toString(16))}`;
};

const padded = (string: string): string => {
  return string.length < 6 ? padded(`0${string}`) : string;
};

export const randomNumber = (seed: number) => {
  let value = Math.sin(seed) * 10000;
  value = value - Math.floor(value);
  return value;
};
