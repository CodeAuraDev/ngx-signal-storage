import { isDevMode, signal, WritableSignal } from "@angular/core";

import {
  CookieStorageAdapter,
  MemoryStorageAdapter,
  WebStorageAdapter,
} from "../classes";
import {
  SignalStorageConfig,
  SignalStorageEnvironment,
  WebStorageLike,
} from "../interfaces";

import {
  browserCookieAccess,
  listenToCookieStore,
  seedPrefixedCookies,
} from "./cookie.function";
import { detectReadMode } from "./read-mode.function";
import { createSignalStorageArea } from "./storage-area.function";
import { assertPrefix } from "./validators.function";
import { listenToWebStorage } from "./web-storage.function";

export function createSignalStorageEnvironment(input: {
  platformId: unknown;
  config?: SignalStorageConfig | null;
}): SignalStorageEnvironment {
  const config = input.config ?? {};
  const prefix = config.prefix ?? "ngx.";
  assertPrefix(prefix);

  const isBrowser = input.platformId === "browser";
  const doc = isBrowser && typeof document !== "undefined" ? document : null;
  const readMode = detectReadMode(config.read, isBrowser, doc);
  const webStorageAvailable =
    isBrowser &&
    canUseStorage(readStorage("local")) &&
    canUseStorage(readStorage("session"));
  const useMemory = config.memory === true || !webStorageAvailable;

  if (
    !isBrowser &&
    config.cookiesOnServer &&
    !config.cookieHeader &&
    isDevMode()
  ) {
    console.warn(
      "ngx-signal-storage: cookiesOnServer is set but cookieHeader is empty. Cookie signals render their defaults on the server.",
    );
  }

  const localAdapter = useMemory
    ? new MemoryStorageAdapter(prefix)
    : new WebStorageAdapter(
        readStorage("local") as WebStorageLike,
        prefix,
        (onChange) => listenToWebStorage(localStorage, prefix, onChange),
      );

  const sessionAdapter = useMemory
    ? new MemoryStorageAdapter(prefix)
    : new WebStorageAdapter(readStorage("session") as WebStorageLike, prefix);

  const cookieMemory = new MemoryStorageAdapter(prefix);
  if (!isBrowser && config.cookiesOnServer && config.cookieHeader) {
    seedPrefixedCookies(cookieMemory, config.cookieHeader, prefix);
  }
  const cookieAdapter =
    useMemory || !isBrowser
      ? cookieMemory
      : new CookieStorageAdapter(
          prefix,
          browserCookieAccess(),
          config.cookies,
          listenToCookieStore,
        );

  const ready: WritableSignal<boolean> = signal(false);
  const needsHydration = isBrowser && readMode === "hydrate";
  if (!needsHydration) ready.set(true);

  const shared = {
    ready,
    isBrowser,
    onError: config.onError,
  };

  const local = createSignalStorageArea({
    kind: "local",
    adapter: localAdapter,
    readMode,
    serverRead: false,
    ...shared,
  });
  const session = createSignalStorageArea({
    kind: "session",
    adapter: sessionAdapter,
    readMode,
    serverRead: false,
    ...shared,
  });
  const cookies = createSignalStorageArea({
    kind: "cookie",
    adapter: cookieAdapter,
    readMode: config.cookiesOnServer ? "eager" : readMode,
    serverRead: false,
    ...shared,
  });

  return {
    local,
    session,
    cookies,
    needsHydration,
    markReady(): void {
      ready.set(true);
    },
    destroy(): void {
      local.destroy();
      session.destroy();
      cookies.destroy();
    },
  };
}

function readStorage(kind: "local" | "session"): WebStorageLike | null {
  try {
    if (typeof globalThis === "undefined") return null;
    const candidate =
      kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    return candidate ?? null;
  } catch {
    return null;
  }
}

function canUseStorage(
  storage: WebStorageLike | null,
): storage is WebStorageLike {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) {
    return false;
  }
  try {
    const probe = "__ngx_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}
