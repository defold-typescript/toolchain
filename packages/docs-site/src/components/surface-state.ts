import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import { API_SURFACE_STORAGE_KEY } from "../../app/lib/api-surface-pref";

const SEPARATOR = "\u0000";

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === API_SURFACE_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function readStored(): string {
  try {
    return localStorage.getItem(API_SURFACE_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

// One string, so React can compare snapshots by value.
function snapshot(): string {
  return `${location.search}${SEPARATOR}${readStored()}`;
}

export interface ClientSurface {
  readonly search: string;
  readonly stored: string | null;
}

/**
 * The query and the stored API window, which only the browser knows. `null` on
 * the server and while hydrating, so the first client render matches the served
 * markup; React renders again with the stored window right after.
 */
export function useClientSurface(): ClientSurface | null {
  const value = useSyncExternalStore(subscribe, snapshot, () => null);
  return useMemo(() => {
    if (value === null) return null;
    const at = value.indexOf(SEPARATOR);
    const stored = value.slice(at + 1);
    return { search: value.slice(0, at), stored: stored === "" ? null : stored };
  }, [value]);
}

/** The active window's badge table key, `"<from>|<to>"`, read by the sidebar pills. */
export const ActiveWindowKey = createContext("");

export function useActiveWindowKey(): string {
  return useContext(ActiveWindowKey);
}
