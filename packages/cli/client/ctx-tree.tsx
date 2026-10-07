import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { type CtxPath, ctxKey, isPrimitive, type Primitive } from "./ctx";
import { Glow } from "./glow";
import { ctxGlowKey, useViewer, type ViewerStore } from "./store";

interface NodeProps {
  readonly store: ViewerStore;
  readonly path: CtxPath;
  readonly value: unknown;
  readonly depth: number;
}

const INDENT_REM = 1;

function rowStyle(depth: number) {
  return { paddingLeft: `${depth * INDENT_REM}rem` };
}

function Leaf({ store, path, value, depth }: NodeProps & { value: Primitive }) {
  const key = ctxKey(path);
  const stamp = useViewer(store, (state) => state.ctxStamps[key] ?? 0);
  const since = useViewer(store, (state) => state.glowSince[ctxGlowKey(key)]);
  const now = useViewer(store, (state) => state.now);
  const edit = useViewer(store, (state) => state.edit);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [invalid, setInvalid] = useState(false);
  const shown = JSON.stringify(value);

  const commit = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft ?? "");
    } catch {
      setInvalid(true);
      return;
    }
    setDraft(undefined);
    // The server answers anything but a primitive with an error in the log.
    void edit(path, parsed as Primitive);
  };

  return (
    <div
      data-ctx-path={key}
      data-glow={stamp}
      className="relative flex gap-2 whitespace-pre"
      style={rowStyle(depth)}
    >
      <Glow stamp={stamp} since={since} now={now()} />
      <span className="text-muted-foreground">{path.at(-1)}:</span>
      {draft === undefined ? (
        <button
          type="button"
          data-ctx-value
          title="edit"
          className="cursor-text text-left"
          onClick={() => {
            setDraft(shown);
            setInvalid(false);
          }}
        >
          {shown}
        </button>
      ) : (
        <input
          // biome-ignore lint/a11y/noAutofocus: the input appears because its value was just clicked
          autoFocus
          data-ctx-value
          aria-invalid={invalid}
          className={`min-w-0 flex-1 bg-background px-1 outline outline-1 ${invalid ? "outline-destructive" : "outline-border"}`}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setInvalid(false);
          }}
          onBlur={() => setDraft(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commit();
            } else if (event.key === "Escape") {
              setDraft(undefined);
            }
          }}
        />
      )}
    </div>
  );
}

function Branch({ store, path, value, depth }: NodeProps & { value: object }) {
  const key = ctxKey(path);
  const expanded = !useViewer(store, (state) => state.collapsed.has(key));
  const toggle = useViewer(store, (state) => state.toggleCollapsed);
  const entries = Object.entries(value);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;

  return (
    <>
      <div data-ctx-path={key} className="flex gap-2 whitespace-pre" style={rowStyle(depth)}>
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={expanded ? "collapse" : "expand"}
          className="w-3 cursor-pointer text-muted-foreground"
          onClick={() => toggle(key)}
        >
          {expanded ? (
            <CaretDownIcon className="size-3" aria-hidden="true" />
          ) : (
            <CaretRightIcon className="size-3" aria-hidden="true" />
          )}
        </button>
        <span className="text-muted-foreground">{path.at(-1)}:</span>
        <span data-ctx-value className="text-muted-foreground">
          {summary}
        </span>
      </div>
      {expanded && <Children store={store} path={path} value={value} depth={depth + 1} />}
    </>
  );
}

function Children({ store, path, value, depth }: NodeProps & { value: object }) {
  return (
    <>
      {Object.entries(value).map(([name, child]) => (
        <CtxNode key={name} store={store} path={[...path, name]} value={child} depth={depth} />
      ))}
    </>
  );
}

function CtxNode(props: NodeProps) {
  const { value } = props;
  if (isPrimitive(value)) {
    return <Leaf {...props} value={value} />;
  }
  if (typeof value === "object" && value !== null) {
    return <Branch {...props} value={value} />;
  }
  return null;
}

/** The running instance's ctx as a tree; a primitive leaf is edited in place as a JSON literal. */
export function CtxTree({ store }: { store: ViewerStore }) {
  const ctx = useViewer(store, (state) => state.snapshot?.ctx);
  const running = useViewer(store, (state) => state.snapshot?.running ?? false);
  const attached = useViewer(store, (state) => state.live.attached !== undefined);

  if (attached) {
    return <p className="p-2 text-muted-foreground">ctx is not sent by the game.</p>;
  }
  if (!running) {
    return (
      <p className="p-2 text-muted-foreground">Not running. Start the machine from the bar.</p>
    );
  }
  return (
    <div className="h-full overflow-auto p-2">
      {typeof ctx === "object" && ctx !== null ? (
        <Children store={store} path={[]} value={ctx} depth={0} />
      ) : (
        <span className="whitespace-pre">{JSON.stringify(ctx) ?? "undefined"}</span>
      )}
    </div>
  );
}
