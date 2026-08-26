/**
 * FNV-1a 64-bit, hex-encoded. Fast, synchronous, dependency-free content identity
 * for revision keys. Not cryptographic; providers backed by a real store may
 * substitute a stronger hash as long as it is stable for identical bytes.
 */
export function fnv1a64(bytes: Uint8Array): string {
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (const b of bytes) {
    h ^= BigInt(b)
    h = (h * prime) & mask
  }
  return h.toString(16).padStart(16, '0')
}
