import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { HsmViewIndex } from "../src/hsm-view-server";
import type { Snapshot } from "../src/hsm-view-session";
import {
  applySnapshot,
  type ClickableKey,
  clickableKeys,
  emptyHighlight,
  type Highlight,
  indexSpans,
  type LineSpan,
  spansByLine,
} from "./highlight";
import { appendEntries, emptyLog, type Log, type LogKind } from "./log";
import { emptySearch, type SearchState, search, step } from "./search";

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
  /** Takes a new index; the snapshot that follows it, as on a reload, redraws the highlights. */
  setIndex(index: HsmViewIndex): void;
  /** Applies a snapshot a route returned; its entries are the ones that call added. */
  receive(snapshot: Snapshot): void;
  toggleKind(kind: LogKind): void;
  setQuery(query: string): void;
  stepMatch(delta: 1 | -1): void;
}

export type ViewerStore = StoreApi<ViewerState>;

function lineSpansOf(index: HsmViewIndex): LineSpan[][][] {
  const spans = [...indexSpans(index)];
  return index.files.map((file, fileIndex) =>
    spansByLine(
      file,
      spans.filter(([, span]) => span.file === fileIndex),
    ),
  );
}

export function createViewerStore(): ViewerStore {
  return createStore<ViewerState>()((set) => ({
    index: undefined,
    lineSpans: [],
    snapshot: undefined,
    highlight: emptyHighlight,
    clickable: [],
    log: emptyLog,
    hidden: new Set(),
    search: emptySearch,
    setIndex: (index) =>
      set((state) => ({
        index,
        lineSpans: lineSpansOf(index),
        search: search(index.files, state.search.query),
      })),
    receive: (snapshot) =>
      set((state) => ({
        snapshot,
        log: appendEntries(state.log, snapshot.entries),
        ...(state.index === undefined
          ? {}
          : {
              highlight: applySnapshot(state.highlight, state.index, snapshot),
              clickable: clickableKeys(state.index, snapshot),
            }),
      })),
    toggleKind: (kind) =>
      set((state) => {
        const hidden = new Set(state.hidden);
        if (!hidden.delete(kind)) {
          hidden.add(kind);
        }
        return { hidden };
      }),
    setQuery: (query) => set((state) => ({ search: search(state.index?.files ?? [], query) })),
    stepMatch: (delta) => set((state) => ({ search: step(state.search, delta) })),
  }));
}

export function useViewer<T>(store: ViewerStore, selector: (state: ViewerState) => T): T {
  return useStore(store, selector);
}
