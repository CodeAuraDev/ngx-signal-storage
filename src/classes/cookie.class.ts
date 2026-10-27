import { cookieMap, expireCookie, serializeCookie } from "../functions";
import { CookieAccess, CookieOptions, StorageAdapter } from "../interfaces";

export class CookieStorageAdapter implements StorageAdapter {
  private readonly written = new Map<string, CookieOptions>();

  constructor(
    private readonly prefix: string,
    private readonly access: CookieAccess,
    private readonly defaults: CookieOptions = {},
    private readonly listenToExternal?: (onChange: () => void) => () => void,
  ) {}

  get(key: string): string | null {
    return cookieMap(this.access.read()).get(this.prefix + key) ?? null;
  }

  set(key: string, value: string, cookie?: CookieOptions): void {
    const options = { ...this.defaults, ...cookie };
    this.written.set(key, options);
    this.access.write(serializeCookie(this.prefix + key, value, options));
  }

  remove(key: string, cookie?: CookieOptions): void {
    const options = { ...this.defaults, ...this.written.get(key), ...cookie };
    this.written.delete(key);
    this.access.write(expireCookie(this.prefix + key, options));
  }

  keys(): string[] {
    const out: string[] = [];
    for (const name of cookieMap(this.access.read()).keys()) {
      if (!name.startsWith(this.prefix)) continue;
      const logical = name.slice(this.prefix.length);
      if (logical) out.push(logical);
    }
    return out;
  }

  clear(cookie?: CookieOptions): void {
    for (const key of this.keys()) this.remove(key, cookie);
  }

  listen(onChange: () => void): () => void {
    return this.listenToExternal?.(onChange) ?? (() => {});
  }
}
