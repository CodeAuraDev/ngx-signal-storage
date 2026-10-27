import {
  afterNextRender,
  DestroyRef,
  inject,
  PLATFORM_ID,
  Service,
} from "@angular/core";

import { SIGNAL_STORAGE_CONFIG } from "../constants";
import {
  activateSignalStorage,
  createSignalStorageEnvironment,
} from "../functions";
import { SignalStorageArea } from "../interfaces";

/**
 * Root access to local storage, session storage, and cookies as Angular signals.
 *
 * ```ts
 * const storage = inject(SignalStorage);
 * const theme = storage.local<'paper' | 'ink'>('theme', 'paper');
 * ```
 */
@Service()
export class SignalStorage {
  /** Survives browser restarts. Syncs across tabs. */
  readonly local: SignalStorageArea;
  /** Cleared when the tab closes. Not shared across tabs. */
  readonly session: SignalStorageArea;
  /** Sent to your origin on later requests. Size-limited. Never HttpOnly. */
  readonly cookies: SignalStorageArea;

  constructor() {
    const env = createSignalStorageEnvironment({
      platformId: inject(PLATFORM_ID),
      config: inject(SIGNAL_STORAGE_CONFIG, { optional: true }),
    });
    this.local = env.local;
    this.session = env.session;
    this.cookies = env.cookies;
    const release = activateSignalStorage(this);
    if (env.needsHydration) {
      afterNextRender(() => env.markReady());
    }
    inject(DestroyRef).onDestroy(() => {
      release();
      env.destroy();
    });
  }
}
