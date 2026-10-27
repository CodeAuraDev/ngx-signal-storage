import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
} from "@angular/core";

import { SIGNAL_STORAGE_CONFIG } from "../constants";
import { SignalStorageConfig } from "../interfaces";
import { SignalStorage } from "../services";

/**
 * Register storage defaults for the root {@link SignalStorage}.
 * Call once in `ApplicationConfig.providers`.
 * Creates the service during startup so field decorators can read it from templates.
 */
export function provideSignalStorage(
  config: SignalStorageConfig = {},
): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: SIGNAL_STORAGE_CONFIG, useValue: config },
    provideEnvironmentInitializer(() => {
      inject(SignalStorage);
    }),
  ]);
}
