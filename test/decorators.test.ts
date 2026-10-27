// @ts-ignore
import assert from "node:assert/strict";

// @ts-ignore
import { after, describe, it } from "node:test";

import "@angular/compiler";
import {
  Injector,
  PLATFORM_ID,
  runInInjectionContext,
  type WritableSignal,
} from "@angular/core";

import { SignalStorageError } from "../src/classes";
import { SIGNAL_STORAGE_CONFIG } from "../src/constants";
import {
  activateSignalStorage,
  CookieStorage,
  createSignalStorageEnvironment,
  LocalStorage,
  SessionStorage,
} from "../src/functions";
import { SignalStorage } from "../src/services";

interface Prefs {
  theme: WritableSignal<"paper" | "ink">;
  visits: WritableSignal<number>;
  draft: WritableSignal<string>;
  consent: WritableSignal<boolean>;
  created: WritableSignal<Date>;
}

function decoratePrefs(): new () => Prefs {
  class PrefsHost {}
  LocalStorage("theme", "paper" as "paper" | "ink")(
    PrefsHost.prototype,
    "theme",
  );
  LocalStorage("visits", 0)(PrefsHost.prototype, "visits");
  SessionStorage("draft", "")(PrefsHost.prototype, "draft");
  CookieStorage("consent", false, {
    cookie: { expires: 180, path: "/", sameSite: "Lax" },
  })(PrefsHost.prototype, "consent");
  LocalStorage("created", new Date(0), {
    serialize: (value) => value.toISOString(),
    deserialize: (raw) => new Date(raw),
    equal: (a, b) => a.getTime() === b.getTime(),
  })(PrefsHost.prototype, "created");
  return PrefsHost as unknown as new () => Prefs;
}

describe("storage decorators", () => {
  const env = createSignalStorageEnvironment({
    platformId: "server",
    config: { memory: true, prefix: "dec." },
  });
  const release = activateSignalStorage(env);
  const PrefsHost = decoratePrefs();

  after(() => {
    release();
    env.destroy();
  });

  it("reads and writes each area through the decorated field", () => {
    const prefs = new PrefsHost();
    assert.equal(prefs.theme(), "paper");
    prefs.theme.set("ink");
    assert.equal(prefs.theme(), "ink");
    assert.equal(env.local.get("theme"), "ink");

    prefs.visits.update((count) => count + 1);
    assert.equal(prefs.visits(), 1);
    assert.equal(env.local.get("visits"), 1);

    prefs.draft.set("hello");
    assert.equal(env.session.get("draft"), "hello");
    assert.equal(env.local.get("draft"), null);

    prefs.consent.set(true);
    assert.equal(prefs.consent(), true);
    assert.equal(env.cookies.get("consent"), true);
  });

  it("returns the same signal for a key, including across instances", () => {
    const first = new PrefsHost();
    const second = new PrefsHost();
    assert.equal(first.theme, second.theme);
    first.theme.set("paper");
    assert.equal(second.theme(), "paper");
    assert.equal(first.theme, env.local("theme", "paper"));
  });

  it("passes a custom codec through to the signal", () => {
    const prefs = new PrefsHost();
    const next = new Date("2026-10-21T12:00:00.000Z");
    prefs.created.set(next);
    assert.equal(prefs.created().toISOString(), next.toISOString());
    assert.equal(env.local.get("created"), next.toISOString());
  });

  it("throws when storage has not been created", () => {
    release();
    try {
      class Orphan {}
      LocalStorage("theme", "paper")(Orphan.prototype, "theme");
      const orphan = new Orphan() as { theme: WritableSignal<string> };
      assert.throws(
        () => orphan.theme(),
        (error: unknown) => {
          return (
            error instanceof SignalStorageError && error.code === "context"
          );
        },
      );
    } finally {
      activateSignalStorage(env);
    }
  });

  it("uses inject(SignalStorage) while an injection context is active", () => {
    const injector = Injector.create({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        {
          provide: SIGNAL_STORAGE_CONFIG,
          useValue: { memory: true, prefix: "inj." },
        },
        SignalStorage,
      ],
    });

    const prefs = new PrefsHost();
    const seen = runInInjectionContext(injector, () => {
      const current = prefs.visits();
      prefs.visits.set(4);
      return current;
    });
    assert.equal(seen, 0);
    assert.equal(prefs.visits(), 4);
    assert.equal(env.local.get("visits"), 1);
    assert.notEqual(prefs.visits, env.local("visits", 0));
  });
});
