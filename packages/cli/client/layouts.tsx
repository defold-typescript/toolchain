import { useVirtualizer } from "@tanstack/react-virtual";
import { useMemo, useRef } from "react";
import { Panel } from "react-resizable-panels";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CodeLine, CodeView, LINE_HEIGHT, useCodeData, useScrollTarget } from "./code-view";
import { Glow } from "./glow";
import { Handle, SavedGroup } from "./panels";
import { fileGlowKey, type Layout, useViewer, type ViewerStore } from "./store";

function FileName({ store, file, path }: { store: ViewerStore; file: number; path: string }) {
  const lit = useViewer(store, (state) => state.highlight.litFiles.has(file));
  const stamp = useViewer(store, (state) => state.fileStamps[file] ?? 0);
  const since = useViewer(store, (state) => state.glowSince[fileGlowKey(file)]);
  const now = useViewer(store, (state) => state.now);
  return (
    <span className={`relative ${lit ? "bg-tint font-bold" : ""}`}>
      <Glow stamp={stamp} since={since} now={now()} />
      {path}
    </span>
  );
}

/** The file list beside one file's code; only a click on a name switches files. */
export function ListLayout({ store }: { store: ViewerStore }) {
  const files = useViewer(store, (state) => state.index?.files) ?? [];
  const openFile = useViewer(store, (state) => state.openFile);
  const showFile = useViewer(store, (state) => state.showFile);
  return (
    <SavedGroup id="hsm-view-files" orientation="horizontal">
      <Panel id="files" defaultSize="20" minSize="10">
        <ul className="h-full overflow-auto py-1">
          {files.map((file, index) => (
            <li key={file.path}>
              <button
                type="button"
                aria-current={index === openFile}
                className={`w-full cursor-pointer truncate px-2 text-left ${index === openFile ? "underline" : ""}`}
                onClick={() => showFile(index)}
              >
                <FileName store={store} file={index} path={file.path} />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
      <Handle orientation="horizontal" />
      <Panel id="code" minSize="20">
        <CodeView key={openFile} store={store} file={openFile} />
      </Panel>
    </SavedGroup>
  );
}

type Row = { readonly file: number; readonly line: number | undefined };

/** Every file in one virtualized list, each under a header row with its name. */
export function StackedLayout({ store }: { store: ViewerStore }) {
  const data = useCodeData(store);
  const { rows, firstRow } = useMemo(() => {
    const rows: Row[] = [];
    const firstRow: number[] = [];
    data.files.forEach((file, index) => {
      firstRow.push(rows.length);
      rows.push({ file: index, line: undefined });
      file.lines.forEach((_, line) => {
        rows.push({ file: index, line });
      });
    });
    return { rows, firstRow };
  }, [data.files]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LINE_HEIGHT,
    overscan: 20,
  });
  useScrollTarget(store, virtualizer, (target) => {
    const first = firstRow[target.file];
    return first === undefined ? undefined : first + 1 + target.line;
  });

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <div className="relative min-w-max" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = rows[item.index] as Row;
          return (
            <div
              key={item.key}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              {row.line === undefined ? (
                <div
                  className="sticky left-0 border-border border-b bg-background px-2"
                  style={{ height: LINE_HEIGHT }}
                >
                  <FileName store={store} file={row.file} path={data.files[row.file]?.path ?? ""} />
                </div>
              ) : (
                <CodeLine data={data} file={row.file} line={row.line} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CodeArea({ store }: { store: ViewerStore }) {
  const layout = useViewer(store, (state) => state.layout);
  return layout === "list" ? <ListLayout store={store} /> : <StackedLayout store={store} />;
}

const LAYOUT_LABEL: Readonly<Record<Layout, string>> = { list: "List", stacked: "Stacked" };

export function LayoutToggle({ store }: { store: ViewerStore }) {
  const layout = useViewer(store, (state) => state.layout);
  const setLayout = useViewer(store, (state) => state.setLayout);
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label="layout"
      value={layout}
      onValueChange={(value) => {
        // Radix sends "" when the active item is clicked again.
        if (value === "list" || value === "stacked") {
          setLayout(value);
        }
      }}
    >
      {(["list", "stacked"] as const).map((option) => (
        <ToggleGroupItem key={option} value={option}>
          {LAYOUT_LABEL[option]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
