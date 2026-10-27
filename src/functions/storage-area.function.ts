import {
  computed,
  isDevMode,
  linkedSignal,
  signal,
  untracked,
  WritableSignal,
} from "@angular/core";

import { SignalStorageError } from "../classes";
import { DEFAULT_MAX_LENGTH } from "../constants";
import {
  AreaOrigin,
  CacheEntry,
  SignalStorageArea,
  StorageSignalOptions,
} from "../interfaces";

import { cloneValue } from "./clone.function";
import { serializeValue } from "./serialize.function";
import { assertKey } from "./validators.function";
import { decodeStored, encodeVersioned } from "./version.function";

/**
 * One local, session, or cookie store.
 * Signals are real `WritableSignal`s (`linkedSignal` with a custom setter)
 * so templates, `computed`, and `effect` track them and `set` / `update` write through.
 *
 * Writes that fail (quota, corrupt, unavailable) are reported via `onError` and do not
 * update the signal, so the UI keeps the last good value.
 */
export function createSignalStorageArea(
  origin: AreaOrigin,
): SignalStorageArea & { destroy(): void } {
  const cache = new Map<string, CacheEntry<any>>();
  const version = signal(0);
  let suppressWrite = false;
  let destroyed = false;

  const stopListen =
    origin.adapter.listen?.(() => {
      queueMicrotask(() => {
        if (destroyed) return;
        onExternal();
      });
    }) ?? (() => {});

  const keys = computed(() => {
    version();
    if (origin.isBrowser && origin.readMode === "hydrate" && !origin.ready())
      return [];
    try {
      return origin.adapter.keys();
    } catch (error) {
      report(asError(error, "read", "Could not list storage keys."));
      return [];
    }
  });

  function report(error: SignalStorageError): void {
    origin.onError?.(error);
    if (isDevMode()) console.warn(`ngx-signal-storage: ${error.message}`);
  }

  function onExternal(): void {
    if (origin.isBrowser && origin.readMode === "hydrate" && !origin.ready())
      return;
    pushCached();
    version.update((n) => n + 1);
  }

  function pushCached(): void {
    suppressWrite = true;
    try {
      for (const [key, entry] of cache) {
        const next = readValue(key, entry.defaultValue, entry.options);
        if (!sameValue(entry, next)) entry.signal.set(next);
      }
    } finally {
      suppressWrite = false;
    }
  }

  function sameValue(entry: CacheEntry<any>, next: unknown): boolean {
    const current = untracked(() => entry.signal());
    if (entry.options?.equal) return entry.options.equal(current, next);
    if (Object.is(current, next)) return true;
    try {
      return JSON.stringify(current) === JSON.stringify(next);
    } catch {
      return false;
    }
  }

  function canRead<T>(options?: StorageSignalOptions<T>): boolean {
    const mode = options?.read ?? origin.readMode;
    if (mode === "eager") return true;
    if (!origin.isBrowser) return origin.serverRead;
    return origin.ready();
  }

  function readValue<T>(
    key: string,
    defaultValue: T,
    options?: StorageSignalOptions<T>,
  ): T {
    if (!canRead(options)) return cloneValue(defaultValue);
    let raw: string | null;
    try {
      raw = origin.adapter.get(key);
    } catch (error) {
      report(asError(error, "read", `Could not read "${key}".`));
      return cloneValue(defaultValue);
    }
    if (raw == null) return cloneValue(defaultValue);
    return decode(key, raw, defaultValue, options);
  }

  function decode<T>(
    key: string,
    raw: string,
    defaultValue: T,
    options?: StorageSignalOptions<T>,
  ): T {
    if (options?.deserialize) {
      try {
        return options.deserialize(raw);
      } catch (error) {
        report(asError(error, "corrupt", `Could not deserialize "${key}".`));
        return cloneValue(defaultValue);
      }
    }

    const decoded = decodeStored(raw);
    if (!decoded) {
      report(
        new SignalStorageError("corrupt", `Corrupt payload for "${key}".`),
      );
      return cloneValue(defaultValue);
    }

    const target = options?.version;
    if (target !== undefined && decoded.version < target && options?.migrate) {
      try {
        const migrated = options.migrate(decoded.data, decoded.version);
        try {
          origin.adapter.set(
            key,
            encodeVersioned(target, migrated),
            options.cookie,
          );
        } catch {
          /* keep the migrated value in memory even if the rewrite fails */
        }
        return migrated;
      } catch (error) {
        report(
          asError(
            error,
            "corrupt",
            `Could not migrate "${key}" from v${decoded.version}.`,
          ),
        );
        return cloneValue(defaultValue);
      }
    }

    return decoded.data as T;
  }

  function writeValue<T>(
    key: string,
    value: T,
    options?: StorageSignalOptions<T>,
  ): void {
    if (value === undefined) {
      throw new SignalStorageError(
        "serialize",
        `Cannot store undefined for "${key}". Remove the key instead.`,
      );
    }
    const encoded = options?.serialize
      ? options.serialize(value)
      : options?.version !== undefined
        ? encodeVersioned(options.version, JSON.parse(serializeValue(value)))
        : serializeValue(value);
    if (typeof encoded !== "string") {
      throw new SignalStorageError(
        "serialize",
        `Serializer for "${key}" must return a string.`,
      );
    }
    const limit =
      options?.maxLength ??
      (origin.kind === "cookie" ? 3500 : DEFAULT_MAX_LENGTH);
    if (encoded.length > limit) {
      throw new SignalStorageError(
        "size",
        `Value for "${key}" exceeds ${limit} characters.`,
      );
    }
    if (origin.adapter.get(key) === encoded) return;
    origin.adapter.set(key, encoded, options?.cookie);
  }

  function safeWrite<T>(
    key: string,
    value: T,
    options?: StorageSignalOptions<T>,
  ): boolean {
    try {
      writeValue(key, value, options);
      return true;
    } catch (error) {
      report(asError(error, "write", `Could not write "${key}".`));
      return false;
    }
  }

  function fingerprint<T>(
    defaultValue: T,
    options?: StorageSignalOptions<T>,
  ): string {
    let encoded = "";
    try {
      encoded = JSON.stringify(defaultValue);
    } catch {
      encoded = Object.prototype.toString.call(defaultValue);
    }
    return `${encoded}|${options?.read ?? ""}|${options?.version ?? ""}|${JSON.stringify(options?.cookie ?? null)}|${options?.serialize ? 1 : 0}|${options?.deserialize ? 1 : 0}`;
  }

  const kind = origin.kind;

  function open<T>(
    key: string,
    defaultValue: T,
    options?: StorageSignalOptions<T>,
  ): WritableSignal<T> {
    assertKey(key, origin.kind);
    const existing = cache.get(key) as CacheEntry<T> | undefined;
    if (existing) {
      if (
        isDevMode() &&
        existing.fingerprint !== fingerprint(defaultValue, options)
      ) {
        console.warn(
          `ngx-signal-storage: "${origin.kind}:${key}" already exists. The first default value and options are kept.`,
        );
      }
      return existing.signal;
    }

    const readOptions = options;
    const created = linkedSignal(
      () => readValue(key, defaultValue, readOptions),
      {
        equal: options?.equal,
        debugName:
          options?.debugName ?? `ngx-signal-storage.${origin.kind}.${key}`,
        set: (value, rawSet) => {
          if (suppressWrite) {
            rawSet(value);
            return;
          }
          if (safeWrite(key, value, readOptions)) {
            rawSet(value);
            untracked(() => version.update((n) => n + 1));
          }
        },
      },
    );

    cache.set(key, {
      signal: created as WritableSignal<unknown>,
      defaultValue,
      options,
      fingerprint: fingerprint(defaultValue, options),
    });
    return created;
  }

  function get<T>(key: string, defaultValue?: T): T | null {
    assertKey(key, origin.kind);
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    const fallback =
      defaultValue !== undefined ? defaultValue : entry?.defaultValue;
    try {
      const raw = origin.adapter.get(key);
      if (raw == null)
        return fallback === undefined ? null : cloneValue(fallback);
      if (fallback === undefined) {
        const decoded = decodeStored(raw);
        return decoded ? (decoded.data as T) : (raw as unknown as T);
      }
      try {
        return JSON.parse(raw) as T;
      } catch {
        if (defaultValue !== undefined) return defaultValue;
        return raw as unknown as T;
      }
    } catch (error) {
      report(asError(error, "read", `Could not read "${key}".`));
      return fallback === undefined ? null : cloneValue(fallback);
    }
  }

  function set<T>(
    key: string,
    value: T,
    options?: StorageSignalOptions<T>,
  ): void {
    assertKey(key, origin.kind);
    const entry = cache.get(key) as CacheEntry<T> | undefined;
    const resolved = options ?? entry?.options;
    try {
      writeValue(key, value, resolved);
    } catch (error) {
      const wrapped = asError(error, "write", `Could not write "${key}".`);
      report(wrapped);
      throw wrapped;
    }
    if (entry && !sameValue(entry, value)) {
      suppressWrite = true;
      try {
        entry.signal.set(value);
      } finally {
        suppressWrite = false;
      }
    }
    version.update((n) => n + 1);
  }

  function remove(key: string): void {
    assertKey(key, origin.kind);
    const entry = cache.get(key);
    try {
      origin.adapter.remove(key, entry?.options?.cookie);
    } catch (error) {
      report(asError(error, "write", `Could not remove "${key}".`));
      return;
    }
    if (entry) {
      const next = cloneValue(entry.defaultValue);
      if (!sameValue(entry, next)) {
        suppressWrite = true;
        try {
          entry.signal.set(next);
        } finally {
          suppressWrite = false;
        }
      }
    }
    version.update((n) => n + 1);
  }

  function clear(): void {
    try {
      origin.adapter.clear();
    } catch (error) {
      report(asError(error, "write", "Could not clear storage."));
      return;
    }
    pushCached();
    version.update((n) => n + 1);
  }

  function has(key: string): boolean {
    assertKey(key, origin.kind);
    try {
      return origin.adapter.get(key) !== null;
    } catch (error) {
      report(asError(error, "read", `Could not read "${key}".`));
      return false;
    }
  }

  function refresh(): void {
    pushCached();
    version.update((n) => n + 1);
  }

  function destroy(): void {
    destroyed = true;
    stopListen();
    cache.clear();
  }

  return Object.assign(open, {
    kind,
    keys,
    get,
    set,
    remove,
    clear,
    has,
    refresh,
    destroy,
  });
}

function asError(
  error: unknown,
  code: SignalStorageError["code"],
  message: string,
): SignalStorageError {
  return error instanceof SignalStorageError
    ? error
    : new SignalStorageError(code, message, { cause: error });
}
