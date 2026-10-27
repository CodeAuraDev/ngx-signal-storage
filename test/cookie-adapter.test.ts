// @ts-ignore
import assert from "node:assert/strict";

// @ts-ignore
import { describe, it } from "node:test";

import {
  CookieStorageAdapter,
  MemoryStorageAdapter,
  SignalStorageError,
} from "../src/classes";
import {
  expireCookie,
  resolveCookieOptions,
  seedPrefixedCookies,
  serializeCookie,
} from "../src/functions";
import { CookieAccess } from "../src/interfaces";

class Jar implements CookieAccess {
  readonly writes: string[] = [];
  private readonly values = new Map<string, string>();

  read(): string {
    return [...this.values.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }

  write(line: string): void {
    this.writes.push(line);
    const [pair, ...attrs] = line.split(";").map((part) => part.trim());
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    const value = pair.slice(eq + 1);
    const expired = attrs.some((attr) => {
      const lower = attr.toLowerCase();
      if (lower.startsWith("max-age="))
        return Number(lower.slice("max-age=".length)) <= 0;
      if (lower.startsWith("expires="))
        return (
          new Date(attr.slice(attr.indexOf("=") + 1)).getTime() <= Date.now()
        );
      return false;
    });
    if (expired) this.values.delete(name);
    else this.values.set(name, value);
  }
}

describe("cookies", () => {
  it("round-trips a prefixed JSON value and writes attributes", () => {
    const jar = new Jar();
    const cookies = new CookieStorageAdapter("ngx.", jar, {
      path: "/",
      sameSite: "Lax",
      secure: true,
    });
    cookies.set("theme", '"ink"', { expires: 30 });
    assert.equal(cookies.get("theme"), '"ink"');
    assert.deepEqual(cookies.keys(), ["theme"]);
    const line = jar.writes[0];
    assert.match(line, /^ngx\.theme=%22ink%22/);
    assert.match(line, /Path=\//);
    assert.match(line, /SameSite=Lax/);
    assert.match(line, /Secure/);
    assert.match(line, /Expires=/);
  });

  it("clear deletes only prefixed cookies", () => {
    const jar = new Jar();
    jar.write("other=1; Path=/");
    const cookies = new CookieStorageAdapter("ngx.", jar, { path: "/" });
    cookies.set("consent", "true");
    cookies.clear();
    assert.equal(cookies.get("consent"), null);
    assert.match(jar.read(), /other=1/);
  });

  it("forces Secure for SameSite=None and rejects an explicit opt-out", () => {
    const resolved = resolveCookieOptions({ sameSite: "None" });
    assert.equal(resolved.secure, true);
    assert.match(serializeCookie("ngx.a", "1", { sameSite: "None" }), /Secure/);
    assert.throws(
      () => resolveCookieOptions({ sameSite: "None", secure: false }),
      (error: unknown) =>
        error instanceof SignalStorageError && error.code === "cookie",
    );
  });

  it("rejects oversized cookies", () => {
    assert.throws(
      () => serializeCookie("ngx.big", "x".repeat(5000), { path: "/" }),
      (error: unknown) =>
        error instanceof SignalStorageError && error.code === "size",
    );
  });

  it("expires a cookie with the same path", () => {
    const line = expireCookie("ngx.consent", {
      path: "/app",
      sameSite: "Strict",
    });
    assert.match(line, /Max-Age=0/);
    assert.match(line, /Path=\/app/);
    assert.match(line, /SameSite=Strict/);
  });

  it("seeds a memory store from a request Cookie header", () => {
    const memory = new MemoryStorageAdapter("ngx.");
    seedPrefixedCookies(
      memory,
      "other=1; ngx.consent=true; ngx.theme=%22ink%22",
      "ngx.",
    );
    assert.equal(memory.get("consent"), "true");
    assert.equal(memory.get("theme"), '"ink"');
    assert.equal(memory.get("other"), null);
    assert.deepEqual(memory.keys().sort(), ["consent", "theme"]);
  });
});
