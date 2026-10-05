import type { EventObject, MachineInstance } from "./index";

/** @noSelf */
export interface MachineInspector {
  readonly draw: (target: Hash | Url | string) => void;
}

const SILENT: MachineInspector = {
  draw: () => {},
};

const TEXT_OFFSET_Y = 40;

const labelUses: Record<string, number> = {};

function uniqueLabel(label: string): string {
  const uses = (labelUses[label] ?? 0) + 1;
  labelUses[label] = uses;
  return uses === 1 ? label : `${label}#${uses}`;
}

function shown(path: string | undefined): string {
  return path === undefined ? "(stopped)" : path;
}

function shownList(leaves: readonly string[]): string {
  if (leaves.length === 0) {
    return "";
  }
  let text = leaves[0] as string;
  for (let i = 1; i < leaves.length; i++) {
    text = `${text}, ${leaves[i] as string}`;
  }
  return text;
}

function shownLeaves(leaves: readonly string[]): string {
  return leaves.length === 0 ? "(stopped)" : shownList(leaves);
}

export function inspect<Ctx, E extends EventObject, P extends string>(
  instance: MachineInstance<Ctx, E, P>,
  label: string,
): MachineInspector {
  if (!sys.get_engine_info().is_debug) {
    return SILENT;
  }
  const shownLabel = uniqueLabel(label);
  let frame = 0;
  instance.onMove((from, to, cause, event) => {
    const reason = event === undefined ? cause : event.type;
    print(
      `hsm ${shownLabel} frame ${frame}: ${from} -> ${shown(to)} (${reason}) [${shownList(instance.leaves)}]`,
    );
  });
  print(`hsm ${shownLabel} frame ${frame}: inspecting [${shownList(instance.leaves)}]`);
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
