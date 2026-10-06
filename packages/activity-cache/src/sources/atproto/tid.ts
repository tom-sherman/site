const ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";

/** Epoch ms encoded in a TID record key, or `undefined` if `rkey` isn't a TID. */
export const tidTimestamp = (rkey: string): number | undefined => {
  if (
    !/^[234567abcdefghij][234567abcdefghijklmnopqrstuvwxyz]{12}$/.test(rkey)
  ) {
    return undefined;
  }
  let value = 0n;
  for (const char of rkey) value = value * 32n + BigInt(ALPHABET.indexOf(char));
  // Top 53 bits (after the zero sign bit) are microseconds; the low 10 are a clock id.
  return Number((value >> 10n) / 1000n);
};
