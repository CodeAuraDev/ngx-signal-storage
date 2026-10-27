import { VersionedPayload } from "../interfaces";

export function isVersionedPayload(value: unknown): value is VersionedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    typeof (value as VersionedPayload).v === "number" &&
    "d" in value
  );
}

export function encodeVersioned(version: number, data: unknown): string {
  return JSON.stringify({ v: version, d: data } satisfies VersionedPayload);
}

/**
 * Parse a stored string. Returns the data and the version it was written with
 * (`0` when the payload is not an envelope).
 */
export function decodeStored(
  raw: string,
): { version: number; data: unknown } | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (isVersionedPayload(parsed))
      return { version: parsed.v, data: parsed.d };
    return { version: 0, data: parsed };
  } catch {
    return null;
  }
}
