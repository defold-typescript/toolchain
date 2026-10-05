import type { LiveMessage } from "../src/hsm-view-live";
import type { HsmViewIndex } from "../src/hsm-view-server";
import type { Snapshot } from "../src/hsm-view-session";

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type PostRoute = "start" | "send" | "update" | "edit" | "pick";

export interface ViewerApi {
  index(): Promise<HsmViewIndex>;
  snapshot(): Promise<Snapshot>;
  live(): Promise<LiveMessage>;
  post(route: PostRoute, body: Record<string, unknown>): Promise<Snapshot>;
}

async function json<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? `request failed with status ${response.status}`);
  }
  return body;
}

/** The server's routes; every POST answers with the snapshot after the call. */
export function httpApi(fetchRoute: Fetch = (url, init) => fetch(url, init)): ViewerApi {
  return {
    index: async () => json<HsmViewIndex>(await fetchRoute("/api/index")),
    snapshot: async () => json<Snapshot>(await fetchRoute("/api/snapshot")),
    live: async () => json<LiveMessage>(await fetchRoute("/api/live")),
    post: async (route, body) =>
      json<Snapshot>(
        await fetchRoute(`/api/${route}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      ),
  };
}
