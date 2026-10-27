import { SignalStorageError } from "../classes";
import { COOKIE_BYTE_LIMIT } from "../constants";
import { CookieAccess, CookieOptions } from "../interfaces";

export function readCookiePairs(
  header: string,
): Array<{ name: string; value: string }> {
  const pairs: Array<{ name: string; value: string }> = [];
  if (!header) return pairs;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    pairs.push({
      name: decodeCookiePart(trimmed.slice(0, eq).trim()),
      value: decodeCookiePart(trimmed.slice(eq + 1).trim()),
    });
  }
  return pairs;
}

export function cookieMap(header: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of readCookiePairs(header)) map.set(pair.name, pair.value);
  return map;
}

export function resolveCookieOptions(
  options: CookieOptions = {},
): CookieOptions {
  const path = options.path ?? "/";
  if (/[;,]/.test(path)) {
    throw new SignalStorageError(
      "cookie",
      "Cookie path contains illegal characters.",
    );
  }
  if (options.domain !== undefined && /[;\s]/.test(options.domain)) {
    throw new SignalStorageError(
      "cookie",
      "Cookie domain contains illegal characters.",
    );
  }
  if (
    options.maxAge !== undefined &&
    (!Number.isFinite(options.maxAge) || options.maxAge < 0)
  ) {
    throw new SignalStorageError(
      "cookie",
      "Cookie maxAge must be a non-negative number of seconds.",
    );
  }
  if (
    typeof options.expires === "number" &&
    (!Number.isFinite(options.expires) || options.expires < 0)
  ) {
    throw new SignalStorageError(
      "cookie",
      "Cookie expires must be a non-negative number of days, or a Date.",
    );
  }
  let secure = options.secure ?? false;
  if (options.sameSite === "None") {
    if (options.secure === false) {
      throw new SignalStorageError(
        "cookie",
        "SameSite=None requires the Secure attribute.",
      );
    }
    secure = true;
  }
  return { ...options, path, secure };
}

export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions = {},
): string {
  const resolved = resolveCookieOptions(options);
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (resolved.maxAge !== undefined) {
    parts.push(`Max-Age=${Math.trunc(resolved.maxAge)}`);
  } else if (resolved.expires !== undefined) {
    const date =
      typeof resolved.expires === "number"
        ? new Date(Date.now() + resolved.expires * 86_400_000)
        : resolved.expires;
    if (Number.isNaN(date.getTime())) {
      throw new SignalStorageError(
        "cookie",
        "Cookie expires value is not a valid date.",
      );
    }
    parts.push(`Expires=${date.toUTCString()}`);
  }
  parts.push(`Path=${resolved.path ?? "/"}`);
  if (resolved.domain) parts.push(`Domain=${resolved.domain}`);
  if (resolved.sameSite) parts.push(`SameSite=${resolved.sameSite}`);
  if (resolved.secure) parts.push("Secure");
  if (resolved.partitioned) parts.push("Partitioned");
  const line = parts.join("; ");
  if (new TextEncoder().encode(line).length > COOKIE_BYTE_LIMIT) {
    throw new SignalStorageError(
      "size",
      `Cookie "${name}" exceeds the 4096-byte cookie limit.`,
    );
  }
  return line;
}

export function expireCookie(
  name: string,
  options: CookieOptions = {},
): string {
  const resolved = resolveCookieOptions(options);
  const parts = [
    `${encodeURIComponent(name)}=`,
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "Max-Age=0",
    `Path=${resolved.path ?? "/"}`,
  ];
  if (resolved.domain) parts.push(`Domain=${resolved.domain}`);
  if (resolved.sameSite) parts.push(`SameSite=${resolved.sameSite}`);
  if (resolved.secure) parts.push("Secure");
  if (resolved.partitioned) parts.push("Partitioned");
  return parts.join("; ");
}

export function seedPrefixedCookies(
  target: { set(key: string, value: string): void },
  header: string,
  prefix: string,
): void {
  for (const [name, value] of cookieMap(header)) {
    if (!name.startsWith(prefix)) continue;
    const logical = name.slice(prefix.length);
    if (!logical) continue;
    target.set(logical, value);
  }
}

export function listenToCookieStore(onChange: () => void): () => void {
  const store = (
    globalThis as {
      cookieStore?: {
        addEventListener(type: string, listener: () => void): void;
        removeEventListener(type: string, listener: () => void): void;
      };
    }
  ).cookieStore;
  if (!store) return () => {};
  const handler = () => onChange();
  store.addEventListener("change", handler);
  return () => store.removeEventListener("change", handler);
}

export function browserCookieAccess(): CookieAccess {
  return {
    read: () => (typeof document === "undefined" ? "" : document.cookie),
    write: (line: string) => {
      document.cookie = line;
    },
  };
}

function decodeCookiePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
