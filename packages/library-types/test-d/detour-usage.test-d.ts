/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as detour from "detour";

// Compile-only proof for the curated defold-detour native-extension namespace. No
// assertions execute; the `dts-declaration-validity` compile is the gate.

declare const data: string;
const from = vmath.vector3(0, 0, 0);
const to = vmath.vector3(10, 0, 10);

const mesh: detour.NavMesh = detour.init(data);

const path = mesh.find_path(from, to);
const _firstPosition: Vector3 | undefined = path.get(0)?.position;
const _startFlag: true | undefined = path.get(0)?.start;
mesh.find_path(from, to, 1);

mesh.set_area_cost([1, 10, 1, 1, 2, 1.5]);
mesh.set_include_flags(0xffff ^ 0x10);

const crowd = mesh.create_crowd(0.6);
const agent: number = crowd.add_agent(from, 0.6, 2, 8, 3.5, 0);
crowd.set_target(to);
crowd.set_target(to, agent);
crowd.reset_target();
crowd.reset_target(agent);

for (const [id, state] of crowd.update(1 / 60)) {
  const _id: number = id;
  const _agent: detour.CrowdAgent = state;
  const _velocity: Vector3 = state.velocity;
}
const _moved: detour.CrowdAgent | undefined = crowd.update(1 / 60).get(agent);

crowd.remove_agent(agent);
mesh.delete();

// @ts-expect-error `finish` is required; the extension checks a vector3 in slot 3.
mesh.find_path(from);
// @ts-expect-error `dt` is required; the extension checks a number.
crowd.update();
// @ts-expect-error the path is keyed from 0, so it is not an array.
const _points: detour.PathPoint[] = mesh.find_path(from, to);
// @ts-expect-error the navmesh is a string of bytes.
detour.init(1);
// @ts-expect-error an agent's state is one of "walk", "offmesh" and "invalid".
const _state: "idle" = crowd.update(1 / 60).get(agent)?.state;
