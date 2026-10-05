import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import type { HsmViewFile } from "../src/hsm-view-server";
import type { Line, TokenKind } from "../src/hsm-view-tokens";
import { Glow } from "./glow";
import { type ClickableKey, type LineSpan, onKeySpanId, type SpanId } from "./highlight";
import type { SearchMatch } from "./search";
import { dimGlowKey, type ScrollTarget, useViewer, type ViewerStore } from "./store";

/** Every code row is one fixed-height line, so the lists never measure. */
export const LINE_HEIGHT = 20;

const KIND_CLASS: Readonly<Record<TokenKind, string>> = {
  keyword: "text-syntax-keyword",
  identifier: "text-syntax-identifier",
  string: "text-syntax-string",
  number: "text-syntax-number",
  regex: "text-syntax-regex",
  comment: "text-syntax-comment italic",
  punctuation: "text-syntax-punctuation",
  text: "text-syntax-text",
};

type MatchMark = "match" | "current";

interface Mark {
  readonly start: number;
  readonly end: number;
  readonly mark: MatchMark;
}

interface Segment {
  readonly text: string;
  readonly kind: TokenKind;
  readonly ids: readonly SpanId[];
  readonly mark: MatchMark | undefined;
}

/** Cuts a line at every token, span and search match edge, so each piece has one style. */
export function lineSegments(
  runs: Line,
  ranges: readonly LineSpan[],
  marks: readonly Mark[],
): Segment[] {
  const text = runs.map((run) => run.text).join("");
  const edges = new Set<number>([0, text.length]);
  const runStarts: number[] = [];
  let offset = 0;
  for (const run of runs) {
    runStarts.push(offset);
    offset += run.text.length;
    edges.add(offset);
  }
  for (const { start, end } of [...ranges, ...marks]) {
    edges.add(start);
    edges.add(end);
  }
  const sorted = [...edges].filter((edge) => edge <= text.length).sort((a, b) => a - b);
  const segments: Segment[] = [];
  let run = 0;
  for (let index = 0; index + 1 < sorted.length; index++) {
    const start = sorted[index] as number;
    const end = sorted[index + 1] as number;
    while (run + 1 < runs.length && (runStarts[run + 1] as number) <= start) {
      run++;
    }
    const covers = ({ start: from, end: to }: { start: number; end: number }) =>
      from <= start && end <= to;
    segments.push({
      text: text.slice(start, end),
      kind: runs[run]?.kind ?? "text",
      ids: ranges.filter(covers).map((range) => range.id),
      mark: marks.find(covers)?.mark,
    });
  }
  return segments;
}

/** The store slices every code line reads, gathered once per list. */
export interface CodeData {
  readonly files: readonly HsmViewFile[];
  readonly lineSpans: readonly (readonly (readonly LineSpan[])[])[];
  readonly tinted: ReadonlySet<SpanId>;
  readonly stamps: Readonly<Record<SpanId, number>>;
  readonly dimStamps: Readonly<Record<SpanId, number>>;
  readonly glowSince: Readonly<Record<string, number>>;
  readonly clickable: ReadonlyMap<SpanId, ClickableKey>;
  /** Search marks by `file:line`, empty while the search box is closed. */
  readonly marks: ReadonlyMap<string, readonly Mark[]>;
  readonly now: number;
  readonly send: (type: string) => void;
}

const lineKey = (file: number, line: number): string => `${file}:${line}`;

export function useCodeData(store: ViewerStore): CodeData {
  const index = useViewer(store, (state) => state.index);
  const lineSpans = useViewer(store, (state) => state.lineSpans);
  const highlight = useViewer(store, (state) => state.highlight);
  const glowSince = useViewer(store, (state) => state.glowSince);
  const clickableKeys = useViewer(store, (state) => state.clickable);
  const searchState = useViewer(store, (state) => state.search);
  const searchOpen = useViewer(store, (state) => state.searchOpen);
  const now = useViewer(store, (state) => state.now);
  const send = useViewer(store, (state) => state.send);

  const clickable = useMemo(
    () => new Map(clickableKeys.map((key) => [onKeySpanId(key.statePath, key.event), key])),
    [clickableKeys],
  );
  const marks = useMemo(() => {
    const byLine = new Map<string, Mark[]>();
    if (!searchOpen) {
      return byLine;
    }
    searchState.matches.forEach((match: SearchMatch, position) => {
      const key = lineKey(match.file, match.line);
      const list = byLine.get(key) ?? [];
      list.push({
        start: match.start,
        end: match.end,
        mark: position === searchState.current ? "current" : "match",
      });
      byLine.set(key, list);
    });
    return byLine;
  }, [searchState, searchOpen]);

  return {
    files: index?.files ?? [],
    lineSpans,
    tinted: highlight.tinted,
    stamps: highlight.stamps,
    dimStamps: highlight.dimStamps,
    glowSince,
    clickable,
    marks,
    now: now(),
    send: (type) => void send(type),
  };
}

const MARK_CLASS: Readonly<Record<MatchMark, string>> = {
  match: "outline outline-1 outline-muted",
  current: "outline outline-2 outline-ink",
};

function SegmentView({ segment, data }: { segment: Segment; data: CodeData }) {
  const tinted = segment.ids.some((id) => data.tinted.has(id));
  return (
    <span
      className={[
        "relative",
        KIND_CLASS[segment.kind],
        tinted ? "bg-tint" : "",
        segment.mark === undefined ? "" : MARK_CLASS[segment.mark],
      ].join(" ")}
    >
      {segment.ids.map((id) => (
        <Glow key={id} stamp={data.stamps[id] ?? 0} since={data.glowSince[id]} now={data.now} />
      ))}
      {segment.ids.map((id) => (
        <Glow
          key={dimGlowKey(id)}
          stamp={data.dimStamps[id] ?? 0}
          since={data.glowSince[dimGlowKey(id)]}
          now={data.now}
          dim
        />
      ))}
      {segment.text}
    </span>
  );
}

export function CodeLine({ data, file, line }: { data: CodeData; file: number; line: number }) {
  const runs = data.files[file]?.lines[line] ?? [];
  const segments = lineSegments(
    runs,
    data.lineSpans[file]?.[line] ?? [],
    data.marks.get(lineKey(file, line)) ?? [],
  );

  // Consecutive pieces of one clickable key share one button.
  const groups: { key: ClickableKey | undefined; segments: Segment[] }[] = [];
  for (const segment of segments) {
    const key = segment.ids.map((id) => data.clickable.get(id)).find(Boolean);
    const last = groups.at(-1);
    if (last !== undefined && last.key === key) {
      last.segments.push(segment);
    } else {
      groups.push({ key, segments: [segment] });
    }
  }

  return (
    <div data-line={line} className="flex whitespace-pre" style={{ height: LINE_HEIGHT }}>
      <span className="w-12 shrink-0 select-none pr-4 text-right text-muted">{line + 1}</span>
      <span>
        {groups.map((group, groupIndex) => {
          const pieces = group.segments.map((segment, segmentIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's pieces only change with its text
            <SegmentView key={segmentIndex} segment={segment} data={data} />
          ));
          const { key } = group;
          return key === undefined ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: a line's pieces only change with its text
            <span key={groupIndex}>{pieces}</span>
          ) : (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: a line's pieces only change with its text
              key={groupIndex}
              type="button"
              title={`send ${key.event}`}
              className="cursor-pointer underline decoration-dotted underline-offset-2"
              onClick={() => data.send(key.event)}
            >
              {pieces}
            </button>
          );
        })}
      </span>
    </div>
  );
}

/** Scrolls a list to the store's scroll target whenever `toIndex` places it in this list. */
export function useScrollTarget(
  store: ViewerStore,
  virtualizer: Virtualizer<HTMLDivElement, Element>,
  toIndex: (target: ScrollTarget) => number | undefined,
): void {
  const target = useViewer(store, (state) => state.scrollTarget);
  const toIndexRef = useRef(toIndex);
  toIndexRef.current = toIndex;
  useEffect(() => {
    const index = target === undefined ? undefined : toIndexRef.current(target);
    if (index !== undefined) {
      virtualizer.scrollToIndex(index, { align: "center" });
    }
  }, [target, virtualizer]);
}

/** One file's lines, virtualized, with line numbers. */
export function CodeView({ store, file }: { store: ViewerStore; file: number }) {
  const data = useCodeData(store);
  const count = data.files[file]?.lines.length ?? 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  });
  useScrollTarget(store, virtualizer, (target) => (target.file === file ? target.line : undefined));

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="relative min-w-max" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            <CodeLine data={data} file={file} line={item.index} />
          </div>
        ))}
      </div>
    </div>
  );
}
