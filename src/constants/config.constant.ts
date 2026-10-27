import { InjectionToken } from "@angular/core";

import { SignalStorageConfig } from "../interfaces";

/** Optional configuration read by {@link SignalStorage}. */
export const SIGNAL_STORAGE_CONFIG = new InjectionToken<SignalStorageConfig>(
  "SIGNAL_STORAGE_CONFIG",
);

export const DEFAULT_MAX_LENGTH = 4_000_000;
