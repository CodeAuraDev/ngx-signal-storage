# @codeauradev/ngx-signal-storage

Angular 22 signals for `localStorage`, `sessionStorage`, and cookies.

`local`, `session`, and `cookies` each hand back a real `WritableSignal`. Read it in a template, pass it to `computed` or `effect`, and call `set` or `update`. The write goes to the browser store immediately. The same key always returns the same signal, including across components. Local values stay in sync across tabs.

```ts
import { Component, inject } from '@angular/core';
import { SignalStorage } from '@codeauradev/ngx-signal-storage';

@Component({
  selector: 'app-prefs',
  template: `
    <p>Theme {{ theme() }}</p>
    <button (click)="theme.set(theme() === 'ink' ? 'paper' : 'ink')">Toggle</button>
    <p>Visits {{ visits() }}</p>
  `,
})
export class Prefs {
  private readonly storage = inject(SignalStorage);
  readonly theme = this.storage.local<'paper' | 'ink'>('theme', 'paper');
  readonly visits = this.storage.local('visits', 0);
}
```

## Decorators

`@LocalStorage`, `@SessionStorage`, and `@CookieStorage` bind a field to that same writable signal. The template calls it. `set` and `update` write through. The field must not be assigned, and the app must keep Angular's `useDefineForClassFields: false`.

Call `provideSignalStorage()` so the service exists before the first template read. Inside a constructor, `inject()` still finds it if startup has not run yet.

```ts
import { Component } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { CookieStorage, LocalStorage, SessionStorage } from '@codeauradev/ngx-signal-storage';

@Component({
  selector: 'app-prefs',
  template: `
    <p>Theme {{ theme() }}</p>
    <button (click)="theme.set(theme() === 'ink' ? 'paper' : 'ink')">Toggle</button>
    <textarea [value]="draft()" (input)="draft.set($any($event.target).value)"></textarea>
    <button (click)="consent.set(!consent())">Consent {{ consent() }}</button>
  `,
})
export class Prefs {
  @LocalStorage('theme', 'paper')
  readonly theme!: WritableSignal<'paper' | 'ink'>;

  @SessionStorage('draft', '')
  readonly draft!: WritableSignal<string>;

  @CookieStorage('consent', false, { cookie: { expires: 180, path: '/', sameSite: 'Lax' } })
  readonly consent!: WritableSignal<boolean>;
}
```

The same key still returns the same signal, whether you decorated a field or called the area.

## Install

```bash
npm install @codeauradev/ngx-signal-storage
```

Peer dependencies: `@angular/core` `^22.0.0` and `rxjs` `^7.8.0`. The package is built with Angular 22.2 and uses `linkedSignal`'s custom setter so a write updates the signal and the store together, without an `effect`.

## Setup

```ts
import { ApplicationConfig } from '@angular/core';
import { provideSignalStorage } from '@codeauradev/ngx-signal-storage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideSignalStorage({
      prefix: 'app.',
      cookies: { path: '/', sameSite: 'Lax', secure: true, expires: 180 },
    }),
  ],
};
```

`provideSignalStorage` is optional when you inject `SignalStorage` yourself. Field decorators that are read from a template need it, so the service exists before the first render. Without the provider, keys are prefixed with `ngx.` and cookies are session cookies on the current path.

Calling the area again with the same key returns the existing signal. The first default and options win. A development build warns if a later call disagrees.

## Stores

| Member | Backing store | Notes |
| --- | --- | --- |
| `storage.local` | `localStorage` | Survives restarts. Other tabs update the signal through the `storage` event. |
| `storage.session` | `sessionStorage` | Cleared with the tab. Not shared across tabs. |
| `storage.cookies` | `document.cookie` | Sent on later requests. About 4KB per cookie. Cannot be HttpOnly. |

`clear()` removes only keys with your prefix. The rest of the origin's storage is left alone.

Values are JSON. `undefined`, `bigint`, functions, symbols, and non-finite numbers throw `SignalStorageError`. Dates need a custom codec. Do not store secrets: anything in these stores is readable by script on the page.

```ts
readonly created = this.storage.local('created', new Date(0), {
  serialize: (value) => value.toISOString(),
  deserialize: (raw) => new Date(raw),
  equal: (a, b) => a.getTime() === b.getTime(),
});
```

### Cookies

```ts
readonly consent = this.storage.cookies('consent', false, {
  cookie: { expires: 180, path: '/', sameSite: 'Lax', secure: true },
});
```

`expires` is a day count or a `Date`. `maxAge` is seconds and wins if both are set. Omit both for a session cookie. `SameSite=None` forces `Secure`; passing `secure: false` with it throws.

Where the browser supports the Cookie Store API, cookie signals also refresh when a cookie changes outside this call.

Cookie names must be cookie-safe tokens (letters, digits, `.`, `_`, `-`, and a few symbols). Local and session keys only forbid empty strings and control characters.

## API

```ts
storage.local<T>(key, defaultValue, options?): WritableSignal<T>
storage.local.get<T>(key): T | null
storage.local.get<T>(key, defaultValue): T
storage.local.set(key, value, options?)
storage.local.remove(key)
storage.local.clear()
storage.local.has(key)
storage.local.refresh()
storage.local.keys // Signal<readonly string[]>
```

`remove()` drops the key. A live signal returns its default and does not write that default back. `get()` is a one-shot JSON read. Call the area in templates.

`StorageSignalOptions`:

| Option | Role |
| --- | --- |
| `equal` | `ValueEqualityFn` passed through to the signal. |
| `serialize` / `deserialize` | Replace JSON for this key. |
| `cookie` | Attributes for a cookie key. |
| `read` | `'eager'` or `'hydrate'`. See SSR. |
| `debugName` | DevTools name. Default `ngx-signal-storage.<store>.<key>`. |

Errors are `SignalStorageError` with `code` of `'key'`, `'serialize'`, `'quota'`, `'cookie'`, `'size'`, `'write'`, or `'context'` (a decorated field was read before `SignalStorage` existed).

## SSR

`localStorage` and `sessionStorage` do not exist on the server. If a signal is read during the server render and again while the browser hydrates, the values must match or Angular reports a hydration mismatch.

`read: 'auto'` (the default) does that for you:

- A normal browser app reads storage immediately.
- A server-rendered document (`ng-server-context` on the host) keeps local and session signals on their defaults through hydration, then reads storage after the first render.

Cookies can take part in the first paint. Turn that on only when the server sees the same cookies the browser will:

```ts
// app.config.ts
provideSignalStorage({
  prefix: 'app.',
  cookies: { path: '/', sameSite: 'Lax', secure: true },
  cookiesOnServer: true,
});

// app.config.server.ts — include the request header
provideSignalStorage({
  prefix: 'app.',
  cookies: { path: '/', sameSite: 'Lax', secure: true },
  cookiesOnServer: true,
  cookieHeader: request.headers.get('cookie') ?? '',
});
```

`cookiesOnServer` makes cookie signals eager on both sides. Local and session signals still follow `read`. Writes during the server render stay in memory for that request; they do not emit `Set-Cookie`. Set cookies from the browser, or from your server framework.

Per-signal `read: 'eager'` forces a first-render read. That is correct for a client-only view. It will mismatch hydration if you use it on local or session state that the server also rendered.

## Tests

```ts
TestBed.configureTestingModule({
  providers: [provideSignalStorage({ prefix: 'test.', memory: true })],
});
```

`memory: true` keeps every store in memory, including in a browser.

## Build this package

```bash
npm install
npm test
npm run build
```

Publish the `dist/` folder. It is an Angular Package Format build (partial compilation) for the application linker.

## License

MIT
