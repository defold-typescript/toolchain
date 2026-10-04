import type { SnapshotEntry } from "../src/hsm-view-session";

/** The entry groups the log can hide; errors, reloads and edits always show. */
export type LogKind = "transition" | "event" | "engine" | "print";

export const LOG_LIMIT = 500;

export interface LogLine {
  readonly id: number;
  /** The newest of the merged entries, so the line shows the latest time. */
  readonly entry: SnapshotEntry;
  readonly count: number;
}

export interface Log {
  readonly lines: readonly LogLine[];
  readonly nextId: number;
}

export const emptyLog: Log = { lines: [], nextId: 0 };

const KIND_OF: Readonly<Record<SnapshotEntry["kind"], LogKind | undefined>> = {
  transition: "transition",
  event: "event",
  unhandled: "event",
  engine: "engine",
  print: "print",
  edit: undefined,
  reload: undefined,
  error: undefined,
};

// A transition repeats when it moves the same way for the same reason, whatever the event carried.
function identity(entry: SnapshotEntry): string {
  if (entry.kind === "transition") {
    return JSON.stringify([entry.kind, entry.from, entry.to ?? null, entry.cause]);
  }
  const { t: _t, ...rest } = entry;
  return JSON.stringify(rest);
}

/** Adds entries to the log, merging each into the line above when it repeats that line. */
export function appendEntries(log: Log, entries: readonly SnapshotEntry[]): Log {
  if (entries.length === 0) {
    return log;
  }
  const lines = [...log.lines];
  let nextId = log.nextId;
  let lastIdentity =
    lines.length === 0 ? undefined : identity(lines.at(-1)?.entry as SnapshotEntry);
  for (const entry of entries) {
    const key = identity(entry);
    const last = lines.at(-1);
    if (last !== undefined && key === lastIdentity) {
      lines[lines.length - 1] = { id: last.id, entry, count: last.count + 1 };
    } else {
      lines.push({ id: nextId++, entry, count: 1 });
      lastIdentity = key;
    }
  }
  return { lines: lines.slice(-LOG_LIMIT), nextId };
}

export function visibleLines(log: Log, hidden: ReadonlySet<LogKind>): LogLine[] {
  return log.lines.filter((line) => {
    const kind = KIND_OF[line.entry.kind];
    return kind === undefined || !hidden.has(kind);
  });
}
