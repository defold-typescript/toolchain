export interface LiveInstance {
  readonly label: string;
  readonly leaves: readonly string[];
  readonly stopped: boolean;
}

export interface LiveMove {
  readonly label: string;
  readonly from: string;
  /** `undefined` once the machine stopped. */
  readonly to: string | undefined;
  /** The event's `type`, or the cause when no event moved the machine. */
  readonly reason: string;
}

export interface LiveMessage {
  readonly instances: readonly LiveInstance[];
  readonly move?: LiveMove;
}

export interface InspectLine {
  readonly label: string;
  readonly leaves: readonly string[];
  readonly move?: Omit<LiveMove, "label">;
}

export interface LiveRegistry {
  /** The message to broadcast when the line changed the list. */
  feed(line: string): LiveMessage | undefined;
  current(): LiveMessage;
}

const LEVEL_PREFIX = /^[A-Z]+:SCRIPT: /;
const INSPECT_LINE = /^hsm (.+) frame (\d+): (.*) \[([^\]]*)\]$/;
const MOVE = /^(.*) -> (.*) \((.*)\)$/;
const ENGINE_START = /^INFO:ENGINE: Defold Engine\b/;
const STOPPED = "(stopped)";

/** One line `inspect` printed, read back from the editor console; anything else is `undefined`. */
export function parseInspectLine(line: string): InspectLine | undefined {
  const found = INSPECT_LINE.exec(line.replace(/\r$/, "").replace(LEVEL_PREFIX, ""));
  if (found === null) {
    return undefined;
  }
  const [, label = "", , middle = "", list = ""] = found;
  const leaves = list === "" ? [] : list.split(", ");
  if (middle === "inspecting") {
    return { label, leaves };
  }
  const move = MOVE.exec(middle);
  if (move === null) {
    return undefined;
  }
  const [, from = "", to = "", reason = ""] = move;
  return { label, leaves, move: { from, to: to === STOPPED ? undefined : to, reason } };
}

function sameLeaves(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((leaf, i) => leaf === b[i]);
}

/** The latest state of every inspected instance since the engine last started. */
export function createLiveRegistry(): LiveRegistry {
  const instances = new Map<string, LiveInstance>();
  const current = (): LiveMessage => ({ instances: [...instances.values()] });
  return {
    feed(line) {
      if (ENGINE_START.test(line)) {
        if (instances.size === 0) {
          return undefined;
        }
        instances.clear();
        return current();
      }
      const parsed = parseInspectLine(line);
      if (parsed === undefined) {
        return undefined;
      }
      const { label, leaves, move } = parsed;
      const known = instances.get(label);
      if (move === undefined && known !== undefined && sameLeaves(known.leaves, leaves)) {
        return undefined;
      }
      instances.set(label, { label, leaves, stopped: leaves.length === 0 });
      return move === undefined ? current() : { ...current(), move: { label, ...move } };
    },
    current,
  };
}
