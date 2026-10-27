import { StorageAdapter } from "../interfaces";

/** In-memory store used on the server, in tests, and when the browser store is missing. */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  constructor(private readonly prefix: string) {}

  get(key: string): string | null {
    return this.values.get(this.prefix + key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(this.prefix + key, value);
  }

  remove(key: string): void {
    this.values.delete(this.prefix + key);
  }

  keys(): string[] {
    const out: string[] = [];
    for (const full of this.values.keys()) {
      if (full.startsWith(this.prefix))
        out.push(full.slice(this.prefix.length));
    }
    return out;
  }

  clear(): void {
    for (const key of this.keys()) this.remove(key);
  }
}
