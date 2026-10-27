import { SignalStorageArea } from "./storage-area.interface";

export interface SignalStorageEnvironment {
  local: SignalStorageArea;
  session: SignalStorageArea;
  cookies: SignalStorageArea;
  /** Browser document was server-rendered, so local/session reads wait for `markReady()`. */
  needsHydration: boolean;
  markReady(): void;
  destroy(): void;
}
