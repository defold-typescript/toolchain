import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { type CtxPath, ctxKey, isPrimitive } from "./ctx";

interface NodeProps {
  readonly path: CtxPath;
  readonly value: unknown;
  readonly depth: number;
}

const INDENT_REM = 1;

function rowStyle(depth: number) {
  return { paddingLeft: `${depth * INDENT_REM}rem` };
}

function Branch({ path, value, depth }: NodeProps & { value: object }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(value);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <>
      <div data-component={ctxKey(path)} className="whitespace-pre" style={rowStyle(depth)}>
        <button
          type="button"
          aria-expanded={open}
          className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground"
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <CaretDownIcon className="size-3" aria-hidden="true" />
          ) : (
            <CaretRightIcon className="size-3" aria-hidden="true" />
          )}
          {path.at(-1)}: {summary}
        </button>
      </div>
      {open && <Children path={path} value={value} depth={depth + 1} />}
    </>
  );
}

function Children({ path, value, depth }: NodeProps & { value: object }) {
  return (
    <>
      {Object.entries(value).map(([name, child]) => (
        <EntityNode key={name} path={[...path, name]} value={child} depth={depth} />
      ))}
    </>
  );
}

function EntityNode(props: NodeProps) {
  const { path, value, depth } = props;
  if (typeof value === "object" && value !== null) {
    return <Branch {...props} value={value} />;
  }
  return (
    <div data-component={ctxKey(path)} className="whitespace-pre" style={rowStyle(depth)}>
      <span className="text-muted-foreground">{path.at(-1)}:</span>{" "}
      {isPrimitive(value) ? JSON.stringify(value) : String(value)}
    </div>
  );
}

/** One entity's components, read-only; each nested object opens one level per click. */
export function EntityTree({ value }: { value: unknown }) {
  if (typeof value !== "object" || value === null) {
    return <div className="whitespace-pre">{JSON.stringify(value) ?? "undefined"}</div>;
  }
  return <Children path={[]} value={value} depth={0} />;
}
