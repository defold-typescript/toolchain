/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as defgraph from "defgraph.defgraph";

// Compile-only proof for the defgraph fork, written as upstream's examples drive it. No
// assertions execute; the `dts-declaration-validity` compile is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// Every module setting is optional, and a `nil` keeps the current value.
defgraph.map_set_properties();
defgraph.map_set_properties(2, undefined, 0);
defgraph.debug_set_properties(vmath.vector4(1, 0, 1, 1));

const a = defgraph.map_add_node(vmath.vector3(10, 10, 0));
const _a: Equal<typeof a, number> = true;
void _a;
const b = defgraph.map_add_node(vmath.vector3(100, 10, 0));
defgraph.map_add_route(a, b);
defgraph.map_add_route(b, a, true);
defgraph.map_update_node_position(b, vmath.vector3(120, 40, 0));

let move = defgraph.move_initialize(go.get_position(), [a, b], defgraph.ROUTETYPE.CYCLE);
const _move: Equal<typeof move, defgraph.MoveData> = true;
void _move;
defgraph.move_initialize(go.get_position(), [b], undefined, vmath.vector3(1, 0, 0), 2);

// The first value is the movement data to keep, the second this call's result.
const [data, result] = defgraph.move_player(go.get_position(), 2, move);
move = data;
const _data: Equal<typeof data, defgraph.MoveData> = true;
void _data;
const _position: Equal<typeof result.position, Vector3> = true;
void _position;
const _rotation: Equal<typeof result.rotation, Quaternion | undefined> = true;
void _rotation;
const _reached: Equal<typeof result.is_reached, boolean> = true;
void _reached;
const _destination: Equal<typeof result.destination_id, number> = true;
void _destination;

defgraph.debug_draw_map_nodes(true);
defgraph.debug_draw_map_routes();
defgraph.debug_draw_player_move(move, vmath.vector4(1, 0, 0, 1), true);

// @ts-expect-error move_initialize asserts its destination list
defgraph.move_initialize(go.get_position());
if (result.rotation !== undefined) {
  // @ts-expect-error the rotation is a `vmath.quat_rotation_z` quaternion, not a vector
  const facing: Vector3 = result.rotation;
  void facing;
}
