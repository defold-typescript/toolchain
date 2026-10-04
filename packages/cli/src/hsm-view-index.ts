import { type LoadedFile, locationOf, type SourceSpan } from "./hsm-view-load";

interface StateConfig {
  readonly states?: Readonly<Record<string, StateConfig>>;
  readonly on?: Readonly<Record<string, unknown>>;
  readonly after?: Readonly<Record<string, unknown>>;
  readonly always?: unknown;
  readonly update?: unknown;
}

export interface IndexedSpan extends SourceSpan {
  readonly file: number;
}

export interface OnKeyRef {
  readonly statePath: string;
  readonly event: string;
}

export interface MachineIndex {
  readonly states: Readonly<Record<string, IndexedSpan>>;
  readonly onKeys: Readonly<Record<string, Readonly<Record<string, IndexedSpan>>>>;
  readonly rules: Readonly<Record<string, IndexedSpan>>;
  /** The `on` key each `on` rule id belongs to, so no reader splits the id. */
  readonly ruleOnKeys: Readonly<Record<string, OnKeyRef>>;
}

export interface StateRuleIds {
  readonly on: Readonly<Record<string, readonly string[]>>;
  readonly after: Readonly<Record<string, readonly string[]>>;
  readonly always: readonly string[];
  readonly update: string | undefined;
}

export type MachineRuleIds = Readonly<Record<string, StateRuleIds>>;

function childPath(parent: string, name: string): string {
  return `${parent}/${name}`;
}

function list(spec: unknown): readonly unknown[] {
  return Array.isArray(spec) ? spec : [spec];
}

export function ruleIds(config: unknown): MachineRuleIds {
  const ids: Record<string, StateRuleIds> = {};
  const visit = (state: StateConfig, statePath: string): void => {
    const on: Record<string, readonly string[]> = {};
    for (const [event, spec] of Object.entries(state.on ?? {})) {
      on[event] = list(spec).map((_, index) => `${statePath}|on|${event}|${index}`);
    }
    const after: Record<string, readonly string[]> = {};
    for (const delay of Object.keys(state.after ?? {})) {
      after[delay] = [`${statePath}|after|${delay}|0`];
    }
    const always =
      state.always === undefined
        ? []
        : list(state.always).map((_, index) => `${statePath}|always|${index}`);
    ids[statePath] = {
      on,
      after,
      always,
      update: state.update === undefined ? undefined : `${statePath}|update`,
    };
    for (const [name, child] of Object.entries(state.states ?? {})) {
      visit(child, childPath(statePath, name));
    }
  };
  if (typeof config === "object" && config !== null) {
    visit(config as StateConfig, "");
  }
  return ids;
}

export function machineIndex(config: unknown, files: readonly LoadedFile[]): MachineIndex {
  const states: Record<string, IndexedSpan> = {};
  const onKeys: Record<string, Record<string, IndexedSpan>> = {};
  const rules: Record<string, IndexedSpan> = {};
  const ruleOnKeys: Record<string, OnKeyRef> = {};
  const fileIndexes = new Map(files.map((file, index) => [file.path, index]));
  const ids = ruleIds(config);

  const indexed = (file: string, span: SourceSpan | undefined): IndexedSpan | undefined => {
    const index = fileIndexes.get(file);
    return index === undefined || span === undefined ? undefined : { file: index, ...span };
  };

  const keySpan = (container: unknown, key: string, value: unknown): IndexedSpan | undefined => {
    const containerLocation = locationOf(container);
    if (containerLocation !== undefined) {
      const span = indexed(containerLocation.file, containerLocation.keys[key]);
      if (span !== undefined) {
        return span;
      }
    }
    const valueLocation = locationOf(value);
    return valueLocation === undefined
      ? undefined
      : indexed(valueLocation.file, valueLocation.keyOf);
  };

  const visit = (state: StateConfig, statePath: string): void => {
    const on = state.on;
    if (on !== undefined) {
      const byEvent: Record<string, IndexedSpan> = {};
      for (const [event, spec] of Object.entries(on)) {
        const eventSpan = keySpan(on, event, spec);
        if (eventSpan !== undefined) {
          byEvent[event] = eventSpan;
        }
        const entries = list(spec);
        for (const [index, entry] of entries.entries()) {
          const id = ids[statePath]?.on[event]?.[index];
          if (id === undefined) {
            continue;
          }
          ruleOnKeys[id] = { statePath, event };
          const span = entries.length === 1 ? eventSpan : keySpan(entries, String(index), entry);
          if (span !== undefined) {
            rules[id] = span;
          }
        }
      }
      if (Object.keys(byEvent).length > 0) {
        onKeys[statePath] = byEvent;
      }
    }

    const after = state.after;
    if (after !== undefined) {
      for (const [delay, target] of Object.entries(after)) {
        const id = ids[statePath]?.after[delay]?.[0];
        const span = keySpan(after, delay, target);
        if (id !== undefined && span !== undefined) {
          rules[id] = span;
        }
      }
    }

    if (state.always !== undefined) {
      const entries = list(state.always);
      for (const [index, entry] of entries.entries()) {
        const id = ids[statePath]?.always[index];
        const span = keySpan(
          entries.length === 1 ? state : entries,
          entries.length === 1 ? "always" : String(index),
          entry,
        );
        if (id !== undefined && span !== undefined) {
          rules[id] = span;
        }
      }
    }

    if (state.update !== undefined) {
      const id = ids[statePath]?.update;
      const span = keySpan(state, "update", state.update);
      if (id !== undefined && span !== undefined) {
        rules[id] = span;
      }
    }

    const children = state.states;
    if (children === undefined) {
      return;
    }
    for (const [name, child] of Object.entries(children)) {
      const path = childPath(statePath, name);
      const childLocation = locationOf(child);
      const span = childLocation?.keyOf === undefined ? undefined : keySpan(children, name, child);
      if (span !== undefined) {
        states[path] = span;
      }
      visit(child, path);
    }
  };

  if (typeof config === "object" && config !== null) {
    visit(config as StateConfig, "");
  }
  return { states, onKeys, rules, ruleOnKeys };
}
