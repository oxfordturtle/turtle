/**
 * The machine's random number generator: a seeded value in [0, 1). Deliberately
 * not Math.random(), so that SEED makes a run reproducible.
 */
export const randomNumber = (seed: number): number => {
  const value = Math.sin(seed) * 10000;
  return value - Math.floor(value);
};
