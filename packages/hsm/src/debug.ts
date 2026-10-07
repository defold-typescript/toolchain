import type { EventObject, MachineInstance } from "./index";

/**
 * Returned by `inspect`. Keep it on `self` and call its `draw` from `update`.
 * @noSelf
 */
export interface MachineInspector {
  /**
   * Draws the label and the active leaves as debug text, 40 units above `target`'s world
   * position. Each call also advances the frame number the console lines show. In a release
   * build it does nothing.
   */
  readonly draw: (target: Hash | Url | string) => void;
}

const SILENT: MachineInspector = {
  draw: () => {},
};

const TEXT_OFFSET_Y = 40;

const labelUses: Record<string, number> = {};
const issuedLabels: Record<string, boolean> = {};

function uniqueLabel(label: string): string {
  let ordinal = labelUses[label] ?? 1;
  let issued = label;
  while (issuedLabels[issued] === true) {
    ordinal++;
    issued = `${label}#${ordinal}`;
  }
  labelUses[label] = ordinal;
  issuedLabels[issued] = true;
  return issued;
}

const FIELD_ESCAPES: Record<string, string> = {
  "\\": "\\\\",
  "[": "\\[",
  "]": "\\]",
  "(": "\\(",
  ")": "\\)",
  ",": "\\,",
  ">": "\\>",
  ":": "\\:",
  "\n": "\\n",
  "\r": "\\r",
};

// A structural cast keeps each read a plain method call: native in JavaScript, string.sub in Lua.
interface StringChars {
  charAt(index: number): string;
  sub(first: number, last: number): string;
}

// JavaScript strings hold UTF-16 code units; Lua strings hold UTF-8 bytes. Every escaped
// character is ASCII, and ASCII never occurs inside a UTF-8 sequence, so both walks agree.
const UTF16_UNITS = "\u{E000}".length === 1;

function charAt(text: string, index: number): string {
  const chars = text as unknown as StringChars;
  return UTF16_UNITS ? chars.charAt(index) : chars.sub(index + 1, index + 1);
}

function escapeField(text: string): string {
  let escaped = "";
  for (let i = 0; i < text.length; i++) {
    const char = charAt(text, i);
    escaped = `${escaped}${FIELD_ESCAPES[char] ?? char}`;
  }
  return escaped;
}

function raw(text: string): string {
  return text;
}

function shown(path: string | undefined): string {
  return path === undefined ? "(stopped)" : escapeField(path);
}

function shownList(leaves: readonly string[], show: (leaf: string) => string): string {
  if (leaves.length === 0) {
    return "";
  }
  let text = show(leaves[0] as string);
  for (let i = 1; i < leaves.length; i++) {
    text = `${text}, ${show(leaves[i] as string)}`;
  }
  return text;
}

function shownLeaves(leaves: readonly string[]): string {
  return leaves.length === 0 ? "(stopped)" : shownList(leaves, raw);
}

/**
 * Prints one line when it is called, then one line for each move `instance` makes, each starting
 * with `hsm` and the label. Call it once after `start`. A label another `inspect` call already
 * used gets an ordinal, such as `enemy#2`. In a release build it registers nothing and returns an
 * inspector whose `draw` does nothing, so the calls can stay in shipped code.
 */
export function inspect<Ctx, E extends EventObject, P extends string>(
  instance: MachineInstance<Ctx, E, P>,
  label: string,
): MachineInspector {
  if (!sys.get_engine_info().is_debug) {
    return SILENT;
  }
  const shownLabel = uniqueLabel(label);
  const loggedLabel = escapeField(shownLabel);
  let frame = 0;
  instance.onMove((from, to, cause, event) => {
    const reason = event === undefined ? cause : event.type;
    print(
      `hsm ${loggedLabel} frame ${frame}: ${escapeField(from)} -> ${shown(to)} (${escapeField(reason)}) [${shownList(instance.leaves, escapeField)}]`,
    );
  });
  print(
    `hsm ${loggedLabel} frame ${frame}: inspecting [${shownList(instance.leaves, escapeField)}]`,
  );
  return {
    draw: (target) => {
      frame++;
      const p = go.get_world_position(target);
      msg.post("@render:", "draw_debug_text", {
        text: `${shownLabel} ${shownLeaves(instance.leaves)}`,
        position: vmath.vector3(p.x, p.y + TEXT_OFFSET_Y, p.z),
        color: vmath.vector4(1, 1, 1, 1),
      });
    },
  };
}
