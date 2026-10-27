import type { ValueEqualityFn } from "@angular/core";

import { SignalStorageError } from "../classes";
import { CookieOptions } from "../interfaces";
import { SignalRead, StorageReadMode } from "../types";

/** Options for one key. Cookie attributes are ignored by local and session storage. */
export interface StorageSignalOptions<T> {
  equal?: ValueEqualityFn<T>;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
  read?: SignalRead;
  cookie?: CookieOptions;
  debugName?: string;
  /**
   * Schema version stored with the value. When the stored version is lower,
   * {@link migrate} runs and the result is written back.
   */
  version?: number;
  /**
   * Convert a previously stored value to the current shape.
   * `fromVersion` is `0` when the payload has no version envelope.
   */
  migrate?: (raw: unknown, fromVersion: number) => T;
  /** Reject a single write larger than this many UTF-16 code units. Default 4_000_000 for local/session. */
  maxLength?: number;
}

/**
 * Application-wide storage settings.
 * Pass them to {@link provideSignalStorage}.
 */
export interface SignalStorageConfig {
  /**
   * Prefix added to every key. Default `ngx.`.
   * Must be cookie-safe so one prefix works for all three stores.
   * Only prefixed keys are listed or cleared.
   */
  prefix?: string;
  /**
   * `auto` (default) reads immediately in the browser, and waits until after
   * hydration when the document was server-rendered (`ng-server-context`).
   * `eager` always reads the backing store during the first render.
   * `hydrate` keeps the default value through hydration, then reads storage.
   */
  read?: StorageReadMode;
  /** Force an in-memory store. Useful in tests. */
  memory?: boolean;
  /** Default cookie attributes, merged under each cookie write. */
  cookies?: CookieOptions;
  /**
   * Read cookies during the server render and during hydration.
   * Also pass {@link cookieHeader} from the request on the server, and mark
   * cookie signals that are rendered in the first response — or set this flag
   * so every cookie signal is eager. Local and session values still follow `read`.
   */
  cookiesOnServer?: boolean;
  /**
   * Raw `Cookie` request header. Used on the server when {@link cookiesOnServer}
   * is set. Ignored in the browser.
   */
  cookieHeader?: string;
  /**
   * Called for storage failures (quota, corrupt payload, unavailable store).
   * Signal setters do not rethrow after this runs, so the UI keeps the last good value.
   */
  onError?: (error: SignalStorageError) => void;
}

/** Synchronous key/value store. Keys passed in are logical (not prefixed). */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string, cookie?: CookieOptions): void;
  remove(key: string, cookie?: CookieOptions): void;
  keys(): string[];
  clear(cookie?: CookieOptions): void;
  /** External changes only (other tabs, Cookie Store). Must not fire for our own writes. */
  listen?(onChange: () => void): () => void;
}

export interface WebStorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Envelope written when a key uses {@link StorageSignalOptions.version}. */
export interface VersionedPayload {
  v: number;
  d: unknown;
}
