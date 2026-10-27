// @ts-ignore
import assert from "node:assert/strict";

// @ts-ignore
import { describe, it } from "node:test";

import { SignalStorageError } from "../src/classes";
import { cloneValue, deserializeValue, serializeValue } from "../src/functions";

describe("codec", () => {
  it("round-trips JSON values", () => {
    const samples = [
      0,
      false,
      null,
      "paper",
      { visits: 2, tags: ["a"] },
      ["x", 1],
    ];
    for (const sample of samples) {
      assert.deepEqual(
        deserializeValue(serializeValue(sample), "fallback"),
        sample,
      );
    }
  });

  it("rejects values JSON cannot represent", () => {
    assert.throws(
      () => serializeValue(undefined),
      (error: unknown) => {
        return (
          error instanceof SignalStorageError && error.code === "serialize"
        );
      },
    );
    assert.throws(() => serializeValue(Number.NaN), SignalStorageError);
    assert.throws(() => serializeValue(1n), SignalStorageError);
  });

  it("falls back when the payload is corrupt", () => {
    assert.equal(deserializeValue("not-json", 4), 4);
  });

  it("clones object defaults", () => {
    const original = { theme: "paper" };
    const cloned = cloneValue(original);
    assert.deepEqual(cloned, original);
    assert.notEqual(cloned, original);
    assert.equal(cloneValue(3), 3);
  });
});
