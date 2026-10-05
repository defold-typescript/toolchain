import type { IndexedSpan, MachineIndex } from "../src/hsm-view-index";
import type { HsmViewFile } from "../src/hsm-view-server";
import type { Snapshot } from "../src/hsm-view-session";

/** Names one highlightable span: a state key, a rule, or an `on` event key. */
export type SpanId = string;

export const stateSpanId = (statePath: string): SpanId => `state:${statePath}`;
export const ruleSpanId = (ruleId: string): SpanId => `rule:${ruleId}`;
export const onKeySpanId = (statePath: string, event: string): SpanId =>
  `on:${JSON.stringify([statePath, event])}`;

export interface Highlight {
  readonly tinted: ReadonlySet<SpanId>;
  /** How many times each span has started its glow; a view keys the glow element on it. */
  readonly stamps: Readonly<Record<SpanId, number>>;
  /** How many times each rule span has started its dim glow, from a `when` that rejected the event. */
  readonly dimStamps: Readonly<Record<SpanId, number>>;
  readonly litFiles: ReadonlySet<number>;
}

export const emptyHighlight: Highlight = {
  tinted: new Set(),
  stamps: {},
  dimStamps: {},
  litFiles: new Set(),
};

/** A span's part on one line, in columns of that line's text. */
export interface LineSpan {
  readonly id: SpanId;
  readonly start: number;
  readonly end: number;
}

export interface ClickableKey {
  readonly statePath: string;
  readonly event: string;
  readonly span: IndexedSpan;
}

/** Every span the index places, by id. */
export function indexSpans(index: MachineIndex): Map<SpanId, IndexedSpan> {
  const spans = new Map<SpanId, IndexedSpan>();
  for (const [statePath, span] of Object.entries(index.states)) {
    spans.set(stateSpanId(statePath), span);
  }
  for (const [statePath, events] of Object.entries(index.onKeys)) {
    for (const [event, span] of Object.entries(events)) {
      spans.set(onKeySpanId(statePath, event), span);
    }
  }
  for (const [ruleId, span] of Object.entries(index.rules)) {
    spans.set(ruleSpanId(ruleId), span);
  }
  return spans;
}

/**
 * What one snapshot shows: its active states tinted, a glow restarted on each entry and fired
 * rule, and a dim glow on each rule whose `when` rejected the event.
 */
export function applySnapshot(
  previous: Highlight,
  index: MachineIndex,
  snapshot: Snapshot,
): Highlight {
  const spans = indexSpans(index);
  const tinted = new Set(snapshot.active.map(stateSpanId).filter((id) => spans.has(id)));

  const bumped: SpanId[] = snapshot.entered.map(stateSpanId);
  for (const ruleId of snapshot.fired) {
    bumped.push(ruleSpanId(ruleId));
    const onKey = index.ruleOnKeys[ruleId];
    if (onKey !== undefined) {
      bumped.push(onKeySpanId(onKey.statePath, onKey.event));
    }
  }
  const stamps: Record<SpanId, number> = { ...previous.stamps };
  const litFiles = new Set<number>();
  for (const id of bumped) {
    const span = spans.get(id);
    if (span !== undefined) {
      stamps[id] = (stamps[id] ?? 0) + 1;
      litFiles.add(span.file);
    }
  }
  for (const id of tinted) {
    litFiles.add((spans.get(id) as IndexedSpan).file);
  }
  const dimStamps: Record<SpanId, number> = { ...previous.dimStamps };
  for (const ruleId of snapshot.rejected) {
    const id = ruleSpanId(ruleId);
    if (spans.has(id)) {
      dimStamps[id] = (dimStamps[id] ?? 0) + 1;
    }
  }
  return { tinted, stamps, dimStamps, litFiles };
}

/** Cuts each span into one range per line it covers, in that line's columns. */
export function spansByLine(
  file: Pick<HsmViewFile, "lines" | "starts">,
  spans: Iterable<readonly [SpanId, IndexedSpan]>,
): LineSpan[][] {
  const lengths = file.lines.map((line) => line.reduce((sum, run) => sum + run.text.length, 0));
  const perLine: LineSpan[][] = file.lines.map(() => []);
  for (const [id, span] of spans) {
    for (
      let line = lineAt(file.starts, span.start);
      line < perLine.length && (file.starts[line] as number) < span.end;
      line++
    ) {
      const lineStart = file.starts[line] as number;
      const start = Math.max(span.start, lineStart) - lineStart;
      const end = Math.min(span.end, lineStart + (lengths[line] as number)) - lineStart;
      if (end > start) {
        perLine[line]?.push({ id, start, end });
      }
    }
  }
  return perLine;
}

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] as number) <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** The `on` keys a click can send: those of the active states and the always-active root. */
export function clickableKeys(index: MachineIndex, snapshot: Snapshot): ClickableKey[] {
  if (snapshot.active.length === 0) {
    return [];
  }
  const keys: ClickableKey[] = [];
  for (const statePath of ["", ...snapshot.active]) {
    for (const [event, span] of Object.entries(index.onKeys[statePath] ?? {})) {
      keys.push({ statePath, event, span });
    }
  }
  return keys;
}
