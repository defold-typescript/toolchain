import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { SnapshotEntry } from "../src/hsm-view-session";
import { LINE_HEIGHT } from "./code-view";
import { type LogKind, visibleLines } from "./log";
import { useViewer, type ViewerStore } from "./store";

const KINDS: readonly { readonly kind: LogKind; readonly label: string }[] = [
  { kind: "transition", label: "transitions" },
  { kind: "event", label: "events" },
  { kind: "engine", label: "engine" },
  { kind: "print", label: "print" },
];

const json = (value: unknown): string => JSON.stringify(value) ?? "undefined";

function describe(entry: SnapshotEntry): string {
  switch (entry.kind) {
    case "transition":
      return `${entry.from} -> ${entry.to ?? "(stopped)"} by ${entry.cause}${
        entry.event === undefined ? "" : ` ${json(entry.event)}`
      }`;
    case "event":
      return `event ${json(entry.event)}`;
    case "unhandled":
      return `event ${json(entry.event)} taken by no rule`;
    case "engine":
      return `${entry.api}(${entry.args.map(json).join(", ")}) not simulated`;
    case "print":
      return entry.text;
    case "edit":
      return `ctx.${entry.path.join(".")} = ${json(entry.value)}`;
    case "reload":
      return entry.reason === undefined ? "reloaded" : `reloaded: ${entry.reason}`;
    case "error":
      return entry.message;
  }
}

const KIND_CLASS: Partial<Record<SnapshotEntry["kind"], string>> = {
  error: "text-destructive",
  reload: "text-syntax-number",
  unhandled: "text-muted-foreground",
  engine: "text-muted-foreground",
};

/** The log docked under the code, newest last, following the newest line unless scrolled up. */
export function LogPane({ store }: { store: ViewerStore }) {
  const log = useViewer(store, (state) => state.log);
  const hidden = useViewer(store, (state) => state.hidden);
  const toggleKind = useViewer(store, (state) => state.toggleKind);
  const lines = useMemo(() => visibleLines(log, hidden), [log, hidden]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const virtualizer = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 10,
  });

  useEffect(() => {
    if (following.current && lines.length > 0) {
      virtualizer.scrollToIndex(lines.length - 1, { align: "end" });
    }
  }, [lines, virtualizer]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-border border-b bg-muted px-2">
        <span className="text-muted-foreground">log</span>
        {KINDS.map(({ kind, label }) => (
          <label
            key={kind}
            htmlFor={`log-kind-${kind}`}
            className="flex cursor-pointer items-center gap-1"
          >
            <Checkbox
              id={`log-kind-${kind}`}
              checked={!hidden.has(kind)}
              onCheckedChange={() => toggleKind(kind)}
            />
            {label}
          </label>
        ))}
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        onScroll={(event) => {
          const element = event.currentTarget;
          following.current =
            element.scrollTop + element.clientHeight >= element.scrollHeight - LINE_HEIGHT;
        }}
      >
        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const line = lines[item.index];
            if (line === undefined) {
              return null;
            }
            const text = describe(line.entry);
            return (
              <div
                key={line.id}
                title={text}
                className={`absolute top-0 left-0 flex w-full gap-2 overflow-hidden whitespace-pre px-2 ${KIND_CLASS[line.entry.kind] ?? ""}`}
                style={{ height: LINE_HEIGHT, transform: `translateY(${item.start}px)` }}
              >
                <span className="w-8 shrink-0 text-right">
                  {line.count > 1 && (
                    <span className="rounded bg-tint px-1 tabular-nums">{line.count}</span>
                  )}
                </span>
                <span className="w-16 shrink-0 text-right text-muted-foreground tabular-nums">
                  {line.entry.t.toFixed(2)}
                </span>
                <span className="truncate">{text}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
