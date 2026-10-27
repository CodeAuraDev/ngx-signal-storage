import { StorageAdapter, WebStorageLike } from "../interfaces";

import { errorName } from "../functions";

import { SignalStorageError } from "./error.class";

export class WebStorageAdapter implements StorageAdapter {
  constructor(
    private readonly storage: WebStorageLike,
    private readonly prefix: string,
    private readonly listenToExternal?: (onChange: () => void) => () => void,
  ) {}

  get(key: string): string | null {
    try {
      return this.storage.getItem(this.prefix + key);
    } catch (error) {
      throw new SignalStorageError("read", `Could not read "${key}".`, {
        cause: error,
      });
    }
  }

  set(key: string, value: string): void {
    try {
      this.storage.setItem(this.prefix + key, value);
    } catch (error) {
      const name = errorName(error);
      if (
        name === "QuotaExceededError" ||
        name === "NS_ERROR_DOM_QUOTA_REACHED"
      ) {
        throw new SignalStorageError(
          "quota",
          `Quota exceeded writing "${key}".`,
          { cause: error },
        );
      }
      throw new SignalStorageError("write", `Could not write "${key}".`, {
        cause: error,
      });
    }
  }

  remove(key: string): void {
    try {
      this.storage.removeItem(this.prefix + key);
    } catch (error) {
      throw new SignalStorageError("write", `Could not remove "${key}".`, {
        cause: error,
      });
    }
  }

  keys(): string[] {
    const out: string[] = [];
    try {
      for (let index = 0; index < this.storage.length; index += 1) {
        const full = this.storage.key(index);
        if (full !== null && full.startsWith(this.prefix)) {
          out.push(full.slice(this.prefix.length));
        }
      }
    } catch (error) {
      throw new SignalStorageError("write", "Could not list storage keys.", {
        cause: error,
      });
    }
    return out;
  }

  clear(): void {
    for (const key of this.keys()) this.remove(key);
  }

  listen(onChange: () => void): () => void {
    return this.listenToExternal?.(onChange) ?? (() => {});
  }
}
