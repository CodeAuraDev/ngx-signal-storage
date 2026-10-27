import { inject, type WritableSignal } from "@angular/core";

import { SignalStorageError } from "../classes";
import { signals } from "../constants";
import {
  AngularCtor,
  FieldBinding,
  FieldContext,
  StorageAreas,
  StorageSignalOptions,
} from "../interfaces";
import { SignalStorage } from "../services";
import { AreaName } from "../types";

import { activeSignalStorage } from "./storage-refs.function";

/**
 * Property decorator. The field reads as the `WritableSignal` for one localStorage key.
 * Do not assign the field — the decorator owns it.
 *
 * ```ts
 * @LocalStorage('theme', 'paper')
 * readonly theme!: WritableSignal<'paper' | 'ink'>;
 * ```
 */
export function LocalStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageSignalOptions<T>,
): PropertyDecorator {
  return bindStorage("local", key, defaultValue, options);
}

/**
 * Property decorator. The field reads as the `WritableSignal` for one sessionStorage key.
 *
 * ```ts
 * @SessionStorage('draft', '')
 * readonly draft!: WritableSignal<string>;
 * ```
 */
export function SessionStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageSignalOptions<T>,
): PropertyDecorator {
  return bindStorage("session", key, defaultValue, options);
}

/**
 * Property decorator. The field reads as the `WritableSignal` for one cookie.
 * Pass `cookie` in `options` for path, expiry, and SameSite.
 *
 * ```ts
 * @CookieStorage('consent', false, { cookie: { expires: 180, path: '/', sameSite: 'Lax' } })
 * readonly consent!: WritableSignal<boolean>;
 * ```
 */
export function CookieStorage<T>(
  key: string,
  defaultValue: T,
  options?: StorageSignalOptions<T>,
): PropertyDecorator {
  return bindStorage("cookies", key, defaultValue, options);
}

function bindStorage<T>(
  area: AreaName,
  key: string,
  defaultValue: T,
  options?: StorageSignalOptions<T>,
): PropertyDecorator {
  return (target, propertyKey) => {
    // Standard decorators (experimentalDecorators off): the return value is the field initializer.
    if (isFieldContext(propertyKey)) {
      const name = propertyKey.name;
      return function (this: object, initial: T | undefined) {
        const fallback =
          defaultValue !== undefined ? defaultValue : (initial as T);
        return signalFor(this, name, area, key, fallback, options);
      } as unknown as void;
    }

    const prototype = target as object;
    remember(prototype, {
      area,
      key,
      defaultValue,
      options,
      propertyKey,
    } as FieldBinding<unknown>);
    // Legacy decorators. ES2022 class fields still define an own property that shadows a
    // prototype accessor, so Angular's factory reinstalls the signal on the instance.
    Object.defineProperty(prototype, propertyKey, {
      configurable: true,
      enumerable: true,
      get(this: object) {
        return signalFor(this, propertyKey, area, key, defaultValue, options);
      },
      set(this: object) {
        // `this.field = initializer` must not replace the signal.
        signalFor(this, propertyKey, area, key, defaultValue, options);
      },
    });
    patchAngularFactory(prototype.constructor as AngularCtor);
    patchOnInit(prototype);
  };
}

function remember(prototype: object, binding: FieldBinding<unknown>): void {
  const list = fieldMap().get(prototype);
  if (list) {
    list.push(binding);
    return;
  }
  fieldMap().set(prototype, [binding]);
}

function bindingsFor(instance: object): FieldBinding<unknown>[] {
  const found: FieldBinding<unknown>[] = [];
  let prototype = Object.getPrototypeOf(instance) as object | null;
  while (prototype && prototype !== Object.prototype) {
    const list = fieldMap().get(prototype);
    if (list) found.push(...list);
    prototype = Object.getPrototypeOf(prototype) as object | null;
  }
  return found;
}

/** The map lives on the function so a bundler cannot drop it and leave `bindings` undeclared. */
function fieldMap(): WeakMap<object, FieldBinding<unknown>[]> {
  const holder = fieldMap as typeof fieldMap & {
    map?: WeakMap<object, FieldBinding<unknown>[]>;
  };
  return (holder.map ??= new WeakMap());
}

/** Replace own class-field values (`null`, `undefined`, or an initializer) with the live signal. */
function materialize(instance: object): void {
  for (const binding of bindingsFor(instance)) {
    const own = Object.getOwnPropertyDescriptor(instance, binding.propertyKey);
    if (own && "value" in own && isWritableSignal(own.value)) continue;
    const fallback =
      binding.defaultValue !== undefined
        ? binding.defaultValue
        : own && "value" in own && own.value !== undefined
          ? own.value
          : binding.defaultValue;
    const signal = signalFor(
      instance,
      binding.propertyKey,
      binding.area,
      binding.key,
      fallback,
      binding.options,
    );
    Object.defineProperty(instance, binding.propertyKey, {
      configurable: true,
      enumerable: true,
      get: () => signal,
      set: () => signal,
    });
  }
}

function signalFor<T>(
  instance: object,
  propertyKey: PropertyKey,
  area: AreaName,
  key: string,
  defaultValue: T,
  options?: StorageSignalOptions<T>,
): WritableSignal<T> {
  let owned = signals.get(instance);
  const cached = owned?.get(propertyKey);
  if (cached) return cached as WritableSignal<T>;

  const signal = resolveStorage()[area](key, defaultValue, options);
  owned ??= new Map();
  owned.set(propertyKey, signal);
  signals.set(instance, owned);
  return signal;
}

function patchAngularFactory(ctor: AngularCtor): void {
  const apply = () => {
    if (typeof ctor.ɵfac !== "function" || ctor.ɵfac.__storage) return;
    const original = ctor.ɵfac;
    const wrapped: AngularCtor["ɵfac"] = function (this: unknown, t?: unknown) {
      const instance = original.call(this, t);
      materialize(instance);
      return instance;
    };
    wrapped.__storage = true;
    ctor.ɵfac = wrapped;
    if (ctor.ɵcmp?.factory === original) ctor.ɵcmp.factory = wrapped;
    if (ctor.ɵdir?.factory === original) ctor.ɵdir.factory = wrapped;
  };
  apply();
  queueMicrotask(apply);
}

function patchOnInit(prototype: object): void {
  const host = prototype as {
    ngOnInit?: () => void;
    __storageOnInit?: boolean;
  };
  if (host.__storageOnInit) return;
  host.__storageOnInit = true;
  const original = host.ngOnInit;
  host.ngOnInit = function (this: object) {
    materialize(this);
    original?.call(this);
  };
}

function isWritableSignal(value: unknown): value is WritableSignal<unknown> {
  return (
    typeof value === "function" &&
    typeof (value as WritableSignal<unknown>).set === "function"
  );
}

function isFieldContext(value: unknown): value is FieldContext {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as FieldContext).kind === "field"
  );
}

function resolveStorage(): StorageAreas {
  try {
    return inject(SignalStorage);
  } catch (error) {
    if (!missingInjectionContext(error)) throw error;
    const storage = activeSignalStorage();
    if (storage) return storage;
    throw new SignalStorageError(
      "context",
      "Storage decorators need SignalStorage. Call provideSignalStorage() before reading a decorated field.",
      { cause: error },
    );
  }
}

/** `inject()` throws NG0203 (code -203) outside an injection context. */
function missingInjectionContext(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === -203
  ) {
    return true;
  }
  return error instanceof Error && error.message.includes("NG0203");
}
