import { SignalStorageError } from "../classes";
import { cloneValue } from "./clone.function";

/** JSON-encode a storage value. Rejects `undefined`, non-finite numbers, and non-JSON types. */
export function serializeValue(value: unknown): string {
  if (value === undefined) {
    throw new SignalStorageError(
      "serialize",
      "Cannot store undefined. Store null, or remove the key.",
    );
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new SignalStorageError(
      "serialize",
      "Only finite numbers can be stored as JSON.",
    );
  }
  if (
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new SignalStorageError(
      "serialize",
      `Cannot store ${typeof value} values.`,
    );
  }
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") {
      throw new SignalStorageError(
        "serialize",
        "Value is not JSON-serializable.",
      );
    }
    return json;
  } catch (error) {
    if (error instanceof SignalStorageError) throw error;
    throw new SignalStorageError(
      "serialize",
      "Value is not JSON-serializable.",
      { cause: error },
    );
  }
}

/** JSON-decode a storage value. Corrupt payloads fall back to a clone of `fallback`. */
export function deserializeValue<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return cloneValue(fallback);
  }
}
