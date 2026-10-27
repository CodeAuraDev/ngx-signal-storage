/** Clone object defaults so callers cannot mutate the value passed to `signal()`. */
export function cloneValue<T>(value: T): T {
  if (typeof value !== "object" || value === null) return value;
  if (typeof structuredClone !== "function") return value;
  try {
    return structuredClone(value);
  } catch {
    return value;
  }
}
