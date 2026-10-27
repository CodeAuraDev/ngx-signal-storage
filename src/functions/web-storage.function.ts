export function listenToWebStorage(
  storage: Storage,
  prefix: string,
  onChange: () => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (event: StorageEvent) => {
    if (event.storageArea !== storage) return;
    if (event.key !== null && !event.key.startsWith(prefix)) return;
    onChange();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}

export function errorName(error: unknown): string | undefined {
  return error instanceof Error ? error.name : undefined;
}
