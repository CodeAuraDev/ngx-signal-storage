import { SignalStorageErrorCode } from "../types";

/** Error thrown for invalid keys, cookies, serialization, or quota failures. */
export class SignalStorageError extends Error {
  readonly code: SignalStorageErrorCode;
  readonly cause?: unknown;

  constructor(
    code: SignalStorageErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message);
    this.name = "SignalStorageError";
    this.code = code;
    this.cause = options?.cause;
  }
}
