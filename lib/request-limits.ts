/** Shared limits for the serialized workspace request body. */
export const MAX_REQUEST_CHARACTERS = 1_100_000;
export const MAX_REQUEST_BYTES = 1_500_000;

export function requestFitsLimits(serialized: string) {
  return serialized.length <= MAX_REQUEST_CHARACTERS &&
    new TextEncoder().encode(serialized).byteLength <= MAX_REQUEST_BYTES;
}
