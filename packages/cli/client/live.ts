import type { MachineIndex } from "../src/hsm-view-index";
import type { LiveInstance, LiveMove } from "../src/hsm-view-live";
import type { Snapshot, SnapshotEntry } from "../src/hsm-view-session";

/** The `onMove` causes other than `event`; any other reason in a console line is an event's `type`. */
const CAUSES: ReadonlySet<string> = new Set(["after", "update", "stop", "reload", "always"]);

export interface LiveFrame {
  readonly snapshot: Snapshot;
  /** Reported leaves the loaded machine has no state for. */
  readonly unknown: readonly string[];
}

export interface LiveFrameOptions {
  readonly move?: LiveMove;
  /** Seconds since attach. */
  readonly t?: number;
}

function ancestry(leaf: string): string[] {
  const parts = leaf.split("/").filter(Boolean);
  return parts.map((_, i) => `/${parts.slice(0, i + 1).join("/")}`);
}

function moveEntry(move: LiveMove, t: number): SnapshotEntry {
  const cause = CAUSES.has(move.reason) ? move.reason : "event";
  return {
    kind: "transition",
    t,
    from: move.from,
    to: move.to,
    cause,
    event: cause === "event" ? { type: move.reason } : undefined,
  };
}

/**
 * What the page shows for one reported state of a game's instance, as a snapshot the simulation
 * could have produced: no rule fired or rejected, no event accepted, no ctx.
 */
export function liveSnapshot(
  index: MachineIndex,
  previous: Snapshot | undefined,
  instance: LiveInstance,
  options: LiveFrameOptions = {},
): LiveFrame {
  const t = options.t ?? 0;
  const known = instance.leaves.filter((leaf) => index.states[leaf] !== undefined);
  const unknown = instance.leaves.filter((leaf) => index.states[leaf] === undefined);
  const active = [
    ...new Set(known.flatMap((leaf) => ancestry(leaf).filter((p) => index.states[p]))),
  ];
  const before = new Set(previous?.active ?? []);
  return {
    snapshot: {
      machines: previous?.machines ?? [],
      picked: previous?.picked,
      running: !instance.stopped,
      t,
      path: known[0],
      active,
      leaves: known,
      entered: active.filter((statePath) => !before.has(statePath)),
      fired: [],
      rejected: [],
      accepts: [],
      ctx: undefined,
      entries: options.move === undefined ? [] : [moveEntry(options.move, t)],
    },
    unknown,
  };
}
