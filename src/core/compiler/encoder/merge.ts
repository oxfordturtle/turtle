export default (pcode1: number[][], pcode2: number[][]): void => {
  if (pcode1.length === 0) {
    pcode1.push(...pcode2);
  } else {
    const last1 = pcode1[pcode1.length - 1];
    const first2 = pcode2.shift();
    if (first2) last1.push(...first2);
    pcode1.push(...pcode2);
  }
};
