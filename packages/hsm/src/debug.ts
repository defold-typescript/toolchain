import type { EventObject, MachineInstance } from "./index";

/** @noSelf */
export interface MachineInspector {
  readonly draw: (target: Hash | Url | string) => void;
}

const SILENT: MachineInspector = {
  draw: () => {},
};

const TEXT_OFFSET_Y = 40;

function shown(path: string | undefined): string {
  return path === undefined ? "(stopped)" : path;
}

function shownLeaves(leaves: readonly string[]): string {
  if (leaves.length === 0) {
    return "(stopped)";
  }
  let text = leaves[0] as string;
  for (let i = 1; i < leaves.length; i++) {
    text = `${text}, ${leaves[i] as string}`;
  }
  return text;
}

export function inspect<Ctx, E extends EventObject, P extends string>(
  instance: MachineInstance<Ctx, E, P>,
  label: string,
): MachineInspector {
  if (!sys.get_engine_info().is_debug) {
    return SILENT;
  }
  let frame = 0;
  instance.onTransition((from, to, cause, event) => {
    const reason = event === undefined ? cause : event.type;
    print(`hsm ${label} frame ${frame}: ${from} -> ${shown(to)} (${reason})`);
  });
  return {
    draw: (target) => {
      frame++;
      const p = go.get_world_position(target);
      msg.post("@render:", "draw_debug_text", {
        text: `${label} ${shownLeaves(instance.leaves)}`,
        position: vmath.vector3(p.x, p.y + TEXT_OFFSET_Y, p.z),
        color: vmath.vector4(1, 1, 1, 1),
      });
    },
  };
}
