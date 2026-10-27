// @ts-ignore
import assert from "node:assert/strict";

// @ts-ignore
import { describe, it } from "node:test";

import { signal } from "@angular/core";

import {
  MemoryStorageAdapter,
  SignalStorageError,
  WebStorageAdapter,
} from "../src/classes";
import {
  createSignalStorageArea,
  createSignalStorageEnvironment,
  detectReadMode,
} from "../src/functions";
import { StorageAdapter, WebStorageLike } from "../src/interfaces";

class MapStorage implements WebStorageLike {
  private readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (key === "ngx.full") {
      const error = new Error("full");
      error.name = "QuotaExceededError";
      throw error;
    }
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

class FakeAdapter implements StorageAdapter {
  readonly values = new Map<string, string>();
  readonly listeners = new Set<() => void>();
  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  set(key: string, value: string): void {
    this.values.set(key, value);
  }
  remove(key: string): void {
    this.values.delete(key);
  }
  keys(): string[] {
    return [...this.values.keys()];
  }
  clear(): void {
    this.values.clear();
  }
  listen(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }
  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function area(
  adapter: StorageAdapter,
  readMode: "eager" | "hydrate" = "eager",
  ready = signal(true),
) {
  return createSignalStorageArea({
    kind: "local",
    adapter,
    ready,
    readMode,
    serverRead: false,
    isBrowser: true,
  });
}

describe("web storage adapter", () => {
  it("prefixes keys and leaves foreign keys in place", () => {
    const backing = new MapStorage();
    backing.setItem("foreign", "1");
    const storage = new WebStorageAdapter(backing, "ngx.");
    storage.set("theme", '"ink"');
    assert.equal(backing.getItem("ngx.theme"), '"ink"');
    assert.deepEqual(storage.keys(), ["theme"]);
    storage.clear();
    assert.equal(backing.getItem("foreign"), "1");
    assert.equal(backing.getItem("ngx.theme"), null);
  });

  it("reports quota failures", () => {
    const storage = new WebStorageAdapter(new MapStorage(), "ngx.");
    assert.throws(
      () => storage.set("full", "1"),
      (error: unknown) => {
        return error instanceof SignalStorageError && error.code === "quota";
      },
    );
  });
});

describe("signal storage area", () => {
  it("reads and writes a signal through the adapter", () => {
    const store = area(new MemoryStorageAdapter("ngx."));
    const theme = store<"paper" | "ink">("theme", "paper");
    assert.equal(theme(), "paper");
    assert.equal(store.has("theme"), false);
    theme.set("ink");
    assert.equal(theme(), "ink");
    assert.equal(store.get("theme"), "ink");
    theme.update((value) => (value === "ink" ? "paper" : "ink"));
    assert.equal(store.get<"paper" | "ink">("theme", "paper"), "paper");
  });

  it("returns the same signal for a key and keeps object defaults unshared", () => {
    const store = area(new MemoryStorageAdapter("app."));
    const fallback = { size: 1 };
    const first = store("prefs", fallback);
    const second = store("prefs", { size: 9 });
    assert.equal(first, second);
    assert.deepEqual(first(), fallback);
    assert.notEqual(first(), fallback);
    first.update((prefs) => ({ ...prefs, size: prefs.size + 1 }));
    assert.deepEqual(first(), { size: 2 });
    assert.deepEqual(store.get("prefs"), { size: 2 });
  });

  it("removes a key without writing the default back", () => {
    const memory = new MemoryStorageAdapter("ngx.");
    const store = area(memory);
    const visits = store("visits", 0);
    visits.set(4);
    store.remove("visits");
    assert.equal(visits(), 0);
    assert.equal(memory.get("visits"), null);
    assert.equal(store.has("visits"), false);
  });

  it("updates a live signal from imperative writes and external events", async () => {
    const backing = new FakeAdapter();
    const store = area(backing);
    const visits = store("visits", 0);
    store.set("visits", 3);
    assert.equal(visits(), 3);
    backing.set("visits", "8");
    backing.emit();
    await Promise.resolve();
    assert.equal(visits(), 8);
    assert.deepEqual(store.keys(), ["visits"]);
  });

  it("lists keys and clears only this area", () => {
    const memory = new MemoryStorageAdapter("ngx.");
    const store = area(memory);
    store.set("a", 1);
    store("b", "two").set("two");
    assert.deepEqual([...store.keys()].sort(), ["a", "b"]);
    store.clear();
    assert.deepEqual(store.keys(), []);
    assert.equal(store("b", "two")(), "two");
    assert.equal(memory.get("a"), null);
  });

  it("defers browser reads until hydration is marked ready", () => {
    const memory = new MemoryStorageAdapter("ngx.");
    memory.set("theme", '"ink"');
    const ready = signal(false);
    const store = area(memory, "hydrate", ready);
    const theme = store("theme", "paper");
    assert.equal(theme(), "paper");
    assert.deepEqual(store.keys(), []);
    ready.set(true);
    assert.equal(theme(), "ink");
    assert.deepEqual(store.keys(), ["theme"]);
    assert.equal(memory.get("theme"), '"ink"');
  });

  it("supports a custom codec", () => {
    const store = area(new MemoryStorageAdapter("ngx."));
    const created = store("created", new Date(0), {
      serialize: (value) => value.toISOString(),
      deserialize: (raw) => new Date(raw),
      equal: (a, b) => a.getTime() === b.getTime(),
    });
    created.set(new Date("2026-10-21T12:00:00.000Z"));
    assert.equal(store.get("created"), "2026-10-21T12:00:00.000Z");
    const again = store("created", new Date(0), {
      serialize: (value) => value.toISOString(),
      deserialize: (raw) => new Date(raw),
    });
    assert.equal(again().toISOString(), "2026-10-21T12:00:00.000Z");
  });

  it("rejects undefined and illegal cookie keys", () => {
    const local = area(new MemoryStorageAdapter("ngx."));
    assert.throws(() => local.set("theme", undefined), SignalStorageError);
    const cookies = createSignalStorageArea({
      kind: "cookie",
      adapter: new MemoryStorageAdapter("ngx."),
      ready: signal(true),
      readMode: "eager",
      serverRead: false,
      isBrowser: true,
    });
    assert.throws(() => cookies("not a cookie", true), SignalStorageError);
  });
});

describe("environment", () => {
  it("detects server-rendered documents", () => {
    assert.equal(detectReadMode(undefined, false, null), "eager");
    assert.equal(detectReadMode("hydrate", true, null), "hydrate");
    assert.equal(
      detectReadMode(undefined, true, { querySelector: () => ({}) }),
      "hydrate",
    );
    assert.equal(
      detectReadMode(undefined, true, { querySelector: () => null }),
      "eager",
    );
  });

  it("reads request cookies on the server and keeps local storage empty", () => {
    const env = createSignalStorageEnvironment({
      platformId: "server",
      config: {
        prefix: "ngx.",
        cookiesOnServer: true,
        cookieHeader: "ngx.consent=true; other=1",
      },
    });
    assert.equal(env.needsHydration, false);
    assert.equal(env.cookies.get("consent"), true);
    const consent = env.cookies("consent", false);
    assert.equal(consent(), true);
    const theme = env.local("theme", "paper");
    assert.equal(theme(), "paper");
    assert.equal(env.local.has("theme"), false);
    env.destroy();
  });

  it("uses memory when asked and shares a key across signal calls", () => {
    const env = createSignalStorageEnvironment({
      platformId: "browser",
      config: { prefix: "lab.", memory: true },
    });
    const visits = env.local("visits", 0);
    visits.set(2);
    assert.equal(env.session("visits", 0)(), 0);
    assert.equal(env.local.get("visits"), 2);
    env.local.clear();
    assert.equal(visits(), 0);
    env.destroy();
  });
});
