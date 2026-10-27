import type { WritableSignal } from "@angular/core";

export const signals = new WeakMap<
  object,
  Map<PropertyKey, WritableSignal<unknown>>
>();
