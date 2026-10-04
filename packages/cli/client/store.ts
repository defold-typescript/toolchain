import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { HsmViewIndex, ReloadMessage } from "../src/hsm-view-server";
import type { Snapshot } from "../src/hsm-view-session";
import { httpApi, type ViewerApi } from "./api";
import { type CtxPath, changedLeaves, type Primitive } from "./ctx";
import {
  applySnapshot,
  type ClickableKey,
  clickableKeys,
  emptyHighlight,
  type Highlight,
  indexSpans,
  type LineSpan,
  type SpanId,
  spansByLine,
} from "./highlight";
import { appendEntries, emptyLog, type Log, type LogKind } from "./log";
import { emptySearch, type SearchState, search, step } from "./search";

export type Layout = "list" | "stacked";

export const SPEEDS = [1, 0.5, 0.25, 0.1] as const;

/** A line a code view should bring into sight; `seq` repeats a scroll to the same line. */
export interface ScrollTarget {
  readonly file: number;
  readonly line: number;
  readonly seq: number;
}

/** What names a glow: a span id, `ctx:<path key>`, or `file:<index>`. */
export type GlowKey = string;

export const ctxGlowKey = (key: string): GlowKey => `ctx:${key}`;
export const fileGlowKey = (file: number): GlowKey => `file:${file}`;

export interface ViewerState {
  readonly index: HsmViewIndex | undefined;
  /** Per file, per line: the spans that line holds. */
  readonly lineSpans: readonly (readonly (readonly LineSpan[])[])[];
  readonly snapshot: Snapshot | undefined;
  readonly highlight: Highlight;
  readonly clickable: readonly ClickableKey[];
  readonly log: Log;
  readonly hidden: ReadonlySet<LogKind>;
  readonly search: SearchState;
  readonly searchOpen: boolean;
  /** How many times each ctx leaf, by path key, has changed while shown. */
  readonly ctxStamps: Readonly<Record<string, number>>;
  /** How many times each file name has lit up. */
  readonly fileStamps: Readonly<Record<number, number>>;
  /** When each glow last started, on the store's clock, so a remounted element resumes its fade. */
  readonly glowSince: Readonly<Record<GlowKey, number>>;
  readonly collapsed: ReadonlySet<string>;
  readonly layout: Layout;
  readonly openFile: number;
  readonly scrollTarget: ScrollTarget | undefined;
  /** The bar's fields, kept as typed so a half-written value survives a render. */
  readonly startCtx: string;
  readonly payload: string;
  readonly dt: string;
  readonly speed: number;
  readonly playing: boolean;
  /** The last request or input that failed, until the next one succeeds. */
  readonly error: string | undefined;
  readonly reloadError: string | undefined;
  readonly disconnected: boolean;
  readonly now: () => number;
  /** Takes a new index; the snapshot that follows it, as on a reload, redraws the highlights. */
  setIndex(index: HsmViewIndex): void;
  /** Applies a snapshot a route returned; its entries are the ones that call added. */
  receive(snapshot: Snapshot): void;
  toggleKind(kind: LogKind): void;
  setQuery(query: string): void;
  stepMatch(delta: 1 | -1): void;
  setSearchOpen(open: boolean): void;
  toggleCollapsed(key: string): void;
  setLayout(layout: Layout): void;
  /** Opens a file in the list layout at its first tinted state key, else its first state key. */
  showFile(file: number): void;
  setStartCtx(text: string): void;
  setPayload(text: string): void;
  setDt(text: string): void;
  setSpeed(speed: number): void;
  setPlaying(playing: boolean): void;
  setDisconnected(disconnected: boolean): void;
  load(): Promise<void>;
  start(): Promise<void>;
  /** Sends `type` with the bar's payload. */
  send(type: string): Promise<void>;
  update(dt: number): Promise<void>;
  /** Steps once with the bar's dt. */
  step(): Promise<void>;
  edit(path: CtxPath, value: Primitive): Promise<void>;
  pick(name: string): Promise<void>;
  reloaded(message: ReloadMessage): Promise<void>;
}

export type ViewerStore = StoreApi<ViewerState>;

/** Schedules Play's frames; the browser's is `requestAnimationFrame`. */
export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(id: number): void;
}

export interface ViewerStoreOptions {
  readonly api?: ViewerApi;
  readonly now?: () => number;
  readonly frames?: FrameScheduler;
}

/** Play never advances a frame by more than this, so a hidden tab does not leap ahead. */
const MAX_FRAME_SECONDS = 0.1;

interface PlayLoop {
  cancelled: boolean;
  frame: number | undefined;
  last: number | undefined;
}

const animationFrames: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (id) => cancelAnimationFrame(id),
};

class InputError extends Error {}

function lineSpansOf(index: HsmViewIndex): LineSpan[][][] {
  const spans = [...indexSpans(index)];
  return index.files.map((file, fileIndex) =>
    spansByLine(
      file,
      spans.filter(([, span]) => span.file === fileIndex),
    ),
  );
}

function parseJson(text: string, what: string): unknown {
  if (text.trim() === "") {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch (thrown) {
    throw new InputError(`${what} is not JSON: ${(thrown as Error).message}`);
  }
}

function parsePayload(text: string): Record<string, unknown> {
  const payload = parseJson(text, "the payload");
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new InputError("the payload must be a JSON object");
  }
  return payload as Record<string, unknown>;
}

function firstKeyLine(
  perLine: readonly (readonly LineSpan[])[],
  tinted: ReadonlySet<SpanId>,
): number | undefined {
  const isState = (range: LineSpan) => range.id.startsWith("state:");
  const tintedLine = perLine.findIndex((ranges) =>
    ranges.some((range) => isState(range) && tinted.has(range.id)),
  );
  if (tintedLine !== -1) {
    return tintedLine;
  }
  const stateLine = perLine.findIndex((ranges) => ranges.some(isState));
  return stateLine === -1 ? undefined : stateLine;
}

export function createViewerStore(options: ViewerStoreOptions = {}): ViewerStore {
  const api = options.api ?? httpApi();
  const now = options.now ?? (() => performance.now());
  const frames = options.frames ?? animationFrames;
  let seq = 0;
  let loop: PlayLoop | undefined;
  let inFlight: Promise<void> | undefined;

  return createStore<ViewerState>()((set, get) => {
    const scrollTo = (file: number, line: number): ScrollTarget => ({ file, line, seq: ++seq });

    const toMatch = (state: SearchState): Partial<ViewerState> => {
      const match = state.current === undefined ? undefined : state.matches[state.current];
      return match === undefined
        ? { search: state }
        : { search: state, openFile: match.file, scrollTarget: scrollTo(match.file, match.line) };
    };

    const call = async (request: () => Promise<Snapshot>): Promise<void> => {
      try {
        const snapshot = await request();
        set({ error: undefined });
        get().receive(snapshot);
      } catch (thrown) {
        set({ error: thrown instanceof Error ? thrown.message : String(thrown) });
      }
    };

    const stopLoop = (): void => {
      if (loop === undefined) {
        return;
      }
      loop.cancelled = true;
      if (loop.frame !== undefined) {
        frames.cancel(loop.frame);
      }
      loop = undefined;
    };

    const startLoop = (): void => {
      if (loop !== undefined) {
        return;
      }
      const current: PlayLoop = { cancelled: false, frame: undefined, last: undefined };
      loop = current;
      // Each frame waits for the previous update's answer, so requests never pile up.
      const tick = async (time: number) => {
        current.frame = undefined;
        // Only a loop's first tick can find a request in flight: a paused loop's update.
        while (inFlight !== undefined) {
          await inFlight;
        }
        if (current.cancelled) {
          return;
        }
        const elapsed =
          current.last === undefined
            ? 0
            : Math.min((time - current.last) / 1000, MAX_FRAME_SECONDS);
        current.last = time;
        const { update, speed } = get();
        const request = update(elapsed * speed);
        inFlight = request;
        await request;
        if (inFlight === request) {
          inFlight = undefined;
        }
        if (current.cancelled) {
          return;
        }
        const { snapshot, error } = get();
        if (snapshot?.running !== true || snapshot.error !== undefined || error !== undefined) {
          get().setPlaying(false);
          return;
        }
        current.frame = frames.request(tick);
      };
      current.frame = frames.request(tick);
    };

    return {
      index: undefined,
      lineSpans: [],
      snapshot: undefined,
      highlight: emptyHighlight,
      clickable: [],
      log: emptyLog,
      hidden: new Set(),
      search: emptySearch,
      searchOpen: false,
      ctxStamps: {},
      fileStamps: {},
      glowSince: {},
      collapsed: new Set(),
      layout: "list",
      openFile: 0,
      scrollTarget: undefined,
      startCtx: "{}",
      payload: "",
      dt: "0.1",
      speed: 1,
      playing: false,
      error: undefined,
      reloadError: undefined,
      disconnected: false,
      now,
      setIndex: (index) =>
        set((state) => ({
          index,
          lineSpans: lineSpansOf(index),
          search: search(index.files, state.search.query),
          openFile: state.openFile < index.files.length ? state.openFile : 0,
        })),
      receive: (snapshot) =>
        set((state) => {
          const time = now();
          const glowSince: Record<GlowKey, number> = { ...state.glowSince };
          const ctxStamps: Record<string, number> = { ...state.ctxStamps };
          for (const key of changedLeaves(state.snapshot?.ctx, snapshot.ctx)) {
            ctxStamps[key] = (ctxStamps[key] ?? 0) + 1;
            glowSince[ctxGlowKey(key)] = time;
          }
          if (state.index === undefined) {
            return {
              snapshot,
              log: appendEntries(state.log, snapshot.entries),
              ctxStamps,
              glowSince,
            };
          }
          const highlight = applySnapshot(state.highlight, state.index, snapshot);
          for (const [id, stamp] of Object.entries(highlight.stamps)) {
            if (stamp !== state.highlight.stamps[id]) {
              glowSince[id] = time;
            }
          }
          const fileStamps: Record<number, number> = { ...state.fileStamps };
          for (const file of highlight.litFiles) {
            if (!state.highlight.litFiles.has(file)) {
              fileStamps[file] = (fileStamps[file] ?? 0) + 1;
              glowSince[fileGlowKey(file)] = time;
            }
          }
          return {
            snapshot,
            log: appendEntries(state.log, snapshot.entries),
            highlight,
            clickable: clickableKeys(state.index, snapshot),
            ctxStamps,
            fileStamps,
            glowSince,
          };
        }),
      toggleKind: (kind) =>
        set((state) => {
          const hidden = new Set(state.hidden);
          if (!hidden.delete(kind)) {
            hidden.add(kind);
          }
          return { hidden };
        }),
      setQuery: (query) => set((state) => toMatch(search(state.index?.files ?? [], query))),
      stepMatch: (delta) => set((state) => toMatch(step(state.search, delta))),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      toggleCollapsed: (key) =>
        set((state) => {
          const collapsed = new Set(state.collapsed);
          if (!collapsed.delete(key)) {
            collapsed.add(key);
          }
          return { collapsed };
        }),
      setLayout: (layout) => set({ layout }),
      showFile: (file) =>
        set((state) => {
          const line = firstKeyLine(state.lineSpans[file] ?? [], state.highlight.tinted);
          return {
            openFile: file,
            scrollTarget: scrollTo(file, line ?? 0),
          };
        }),
      setStartCtx: (startCtx) => set({ startCtx }),
      setPayload: (payload) => set({ payload }),
      setDt: (dt) => set({ dt }),
      setSpeed: (speed) => set({ speed }),
      setPlaying: (playing) => {
        if (playing) {
          set({ playing });
          startLoop();
        } else {
          stopLoop();
          set({ playing });
        }
      },
      setDisconnected: (disconnected) => set({ disconnected }),
      load: async () => {
        try {
          get().setIndex(await api.index());
          set({ error: undefined });
          get().receive(await api.snapshot());
        } catch (thrown) {
          set({ error: thrown instanceof Error ? thrown.message : String(thrown) });
        }
      },
      start: async () => {
        get().setPlaying(false);
        while (inFlight !== undefined) {
          await inFlight;
        }
        await call(() => api.post("start", { ctx: parseJson(get().startCtx, "the start ctx") }));
      },
      send: (type) =>
        call(() => api.post("send", { event: { ...parsePayload(get().payload), type } })),
      update: (dt) => call(() => api.post("update", { dt })),
      step: () =>
        call(() => {
          const dt = Number(get().dt);
          if (get().dt.trim() === "" || !Number.isFinite(dt)) {
            throw new InputError("dt must be a number");
          }
          return api.post("update", { dt });
        }),
      edit: (path, value) => call(() => api.post("edit", { path, value })),
      pick: (name) =>
        call(async () => {
          const snapshot = await api.post("pick", { name });
          get().setIndex(await api.index());
          return snapshot;
        }),
      reloaded: async (message) => {
        if (!message.ok) {
          set({ reloadError: message.error ?? "the reload failed" });
          get().receive(message.snapshot);
          return;
        }
        await call(async () => {
          get().setIndex(await api.index());
          set({ reloadError: undefined });
          return message.snapshot;
        });
      },
    };
  });
}

export function useViewer<T>(store: ViewerStore, selector: (state: ViewerState) => T): T {
  return useStore(store, selector);
}
