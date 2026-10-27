import { stack } from "../constants";
import { StorageAreas } from "../interfaces";

/**
 * Remember a live storage instance for decorated fields read outside an injection context.
 * Returns a function that drops that instance. Later activations win until released.
 */
export function activateSignalStorage(storage: StorageAreas): () => void {
  stack.push(storage);
  return () => {
    const index = stack.lastIndexOf(storage);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Most recently activated storage, or `null` before the service is constructed. */
export function activeSignalStorage(): StorageAreas | null {
  return stack[stack.length - 1] ?? null;
}
