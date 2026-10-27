import { StorageReadMode } from "../types";

export function detectReadMode(
  configured: StorageReadMode | undefined,
  isBrowser: boolean,
  doc: { querySelector(selector: string): unknown } | null,
): "eager" | "hydrate" {
  if (configured === "eager" || configured === "hydrate") return configured;
  if (!isBrowser || doc == null) return "eager";
  try {
    return doc.querySelector("[ng-server-context]") ? "hydrate" : "eager";
  } catch {
    return "eager";
  }
}
