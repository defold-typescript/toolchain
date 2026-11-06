import { ECS_LIBRARY, HSM_LIBRARY, requireLibrarySourceDir } from "@defold-typescript/transpiler";
import { createHsmViewApp, type HsmViewOpening } from "../src/hsm-view-server";
import { createSession, type HsmViewSession } from "../src/hsm-view-session";
import { httpApi } from "./api";
import { createViewerStore, type FrameScheduler, type ViewerStore } from "./store";

export interface Request {
  readonly route: string;
  readonly body: unknown;
}

export interface TestViewer {
  readonly session: HsmViewSession;
  readonly store: ViewerStore;
  /** Every POST the store made, in order. */
  readonly requests: Request[];
}

export interface TestViewerOptions {
  readonly frames?: FrameScheduler;
  /** Called with each route before it reaches the server; a returned promise keeps it off until it settles. */
  readonly hold?: (route: string) => Promise<void> | undefined;
  readonly notify?: (message: string) => void;
  readonly opening?: HsmViewOpening;
}

/** A store wired to the real routes of a session on `file`, loaded and, given a `ctx`, started with it. */
export async function startViewer(
  file: string,
  ctx: string | undefined,
  options: TestViewerOptions = {},
): Promise<TestViewer> {
  const session = createSession({
    file,
    hsmSourceDir: requireLibrarySourceDir(HSM_LIBRARY),
    ecsSourceDir: requireLibrarySourceDir(ECS_LIBRARY),
  });
  const app = createHsmViewApp({
    session,
    client: { js: "", css: "" },
    ...(options.opening === undefined ? {} : { opening: options.opening }),
  });
  const requests: Request[] = [];
  const store = createViewerStore({
    api: httpApi(async (url, init) => {
      if (init?.method === "POST") {
        requests.push({ route: url, body: JSON.parse(String(init.body)) });
      }
      await options.hold?.(url);
      return app.request(url, init);
    }),
    ...(options.frames === undefined ? {} : { frames: options.frames }),
    ...(options.notify === undefined ? {} : { notify: options.notify }),
  });
  await store.getState().load();
  if (ctx !== undefined) {
    store.getState().setStartCtx(ctx);
    await store.getState().start();
  }
  requests.length = 0;
  return { session, store, requests };
}
