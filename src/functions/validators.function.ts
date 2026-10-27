import { SignalStorageError } from "../classes";
import { CONTROL, COOKIE_TOKEN } from "../constants";
import { SignalStorageArea } from "../interfaces";

export function assertPrefix(prefix: string): void {
  if (prefix !== "" && !COOKIE_TOKEN.test(prefix)) {
    throw new SignalStorageError(
      "key",
      `Storage prefix "${prefix}" must be a cookie-safe token (letters, digits, and . _ - ! # $ % & ' * + ^ \` | ~).`,
    );
  }
}

export function assertKey(key: string, kind: SignalStorageArea["kind"]): void {
  if (typeof key !== "string" || key.length === 0) {
    throw new SignalStorageError(
      "key",
      "Storage key must be a non-empty string.",
    );
  }
  if (key.length > (kind === "cookie" ? 128 : 512)) {
    throw new SignalStorageError("key", `Storage key "${key}" is too long.`);
  }
  if (CONTROL.test(key)) {
    throw new SignalStorageError(
      "key",
      `Storage key "${key}" contains control characters.`,
    );
  }
  if (kind === "cookie" && !COOKIE_TOKEN.test(key)) {
    throw new SignalStorageError(
      "key",
      `Cookie key "${key}" must use cookie-safe characters (letters, digits, and . _ -).`,
    );
  }
}
