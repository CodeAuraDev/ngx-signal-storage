import { Signal, WritableSignal } from "@angular/core";

import { SignalStorageError } from "../classes";

import { StorageAdapter, StorageSignalOptions } from "./storage.interface";

export interface CacheEntry<T> {
  signal: WritableSignal<T>;
  defaultValue: T;
  options?: StorageSignalOptions<T>;
  fingerprint: string;
}

export interface AreaOrigin {
  kind: SignalStorageArea["kind"];
  adapter: StorageAdapter;
  ready: Signal<boolean>;
  /** Area default when a signal does not pass `read`. */
  readMode: "eager" | "hydrate";
  /** When false, a hydrate-mode area returns defaults on the server. */
  serverRead: boolean;
  isBrowser: boolean;
  onError?: (error: SignalStorageError) => void;
}

/** One backing store exposed as signals. */
export interface SignalStorageArea {
  /**
   * Writable signal kept in sync with one key.
   * Calling the area again with the same key returns the same signal.
   * The first call's default value and options win.
   */
  <T>(
    key: string,
    defaultValue: T,
    options?: StorageSignalOptions<T>,
  ): WritableSignal<T>;
  readonly kind: "local" | "session" | "cookie";
  /** Snapshot. Prefer calling the area inside templates. */
  get<T>(key: string): T | null;
  /** Snapshot with a fallback when the key is missing or corrupt. */
  get<T>(key: string, defaultValue: T): T;
  set<T>(key: string, value: T, options?: StorageSignalOptions<T>): void;
  /** Remove the key. A live signal falls back to its default without writing that default. */
  remove(key: string): void;
  /** Remove every key that uses this area's prefix. Other keys in the browser store are left alone. */
  clear(): void;
  has(key: string): boolean;
  /** Re-read the backing store into existing signals. */
  refresh(): void;
  /** Prefixed keys. Empty during hydration when reads are deferred. */
  readonly keys: Signal<readonly string[]>;
}

/** The three areas a storage decorator can bind to. */
export interface StorageAreas {
  readonly local: SignalStorageArea;
  readonly session: SignalStorageArea;
  readonly cookies: SignalStorageArea;
}
