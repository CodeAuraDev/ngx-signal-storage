import { StorageSignalOptions } from "../interfaces";
import { AreaName } from "../types";

export interface FieldBinding<T> {
  area: AreaName;
  key: string;
  defaultValue: T;
  options?: StorageSignalOptions<T>;
  propertyKey: PropertyKey;
}

export interface FieldContext {
  kind: "field";
  name: string | symbol;
}

export interface AngularCtor {
  ɵfac?: ((this: unknown, t?: unknown) => object) & { __storage?: boolean };
  ɵcmp?: { factory?: (t?: unknown) => object };
  ɵdir?: { factory?: (t?: unknown) => object };
}
