const BASE32_SORTABLE = "234567abcdefghijklmnopqrstuvwxyz";

/**
 * A new TID, for a record key that's needed before the record's created:
 * microseconds since the epoch, then a random clock ID, as 13 sortable
 * base32 characters. See https://atproto.com/specs/tid.
 */
export function newTid(now = Date.now()): string {
  const micros =
    BigInt(now) * BigInt(1000) + BigInt(Math.floor(Math.random() * 1000));
  let n = (micros << BigInt(10)) | BigInt(Math.floor(Math.random() * 1024));
  let tid = "";
  for (let i = 0; i < 13; i++) {
    tid = BASE32_SORTABLE[Number(n & BigInt(31))] + tid;
    n >>= BigInt(5);
  }
  return tid;
}
