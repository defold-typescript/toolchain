/// <reference path="../index.d.ts" />
import type { Hash, Matrix4, Opaque, Vector3 } from "../src/core-types";

// Returned tables and property reads typed from what the engine bindings push.

// script_graphics.cpp:Graphics_GetAdapterInfo pushes the per-stage storage-buffer limit.
const perStage: number = graphics.get_adapter_info().limits.max_storage_buffers_per_stage;
void perStage;

// script_sys.cpp:Sys_GetIfaddrs sets `family` to "ipv4", "ipv6" or nil.
const ifaddr = sys.get_ifaddrs()[0];
if (ifaddr !== undefined) {
  const family: "ipv4" | "ipv6" | undefined = ifaddr.family;
  // @ts-expect-error family is nil for an interface that is neither IPv4 nor IPv6
  const _familyEarly: "ipv4" | "ipv6" = ifaddr.family;
  // @ts-expect-error family is one of two address families, not any string
  const _familyWide: "ipx" | undefined = ifaddr.family;
  void family;
  void _familyEarly;
  void _familyWide;
}

// script_sys.cpp:Sys_GetSysInfo pushes the platform-gated fields from char
// arrays, so each is always a string; sys-return-field-presence.ts covers the rest.
const deviceModel: string = sys.get_sys_info().device_model;
void deviceModel;

// script_physics.cpp:Physics_RayCast pushes each hit without a request_id.
declare const from: Vector3;
declare const to: Vector3;
const hit = physics.raycast(from, to, [hash("default")]);
if (hit !== undefined && !Array.isArray(hit)) {
  const group: Hash = hit.group;
  const id: Hash = hit.id;
  // @ts-expect-error physics.raycast results carry no request_id
  const _requestId: number = hit.request_id;
  void group;
  void id;
  void _requestId;
}

// gameobject_props_lua.cpp:LuaPushVar pushes a Matrix4 property as a matrix,
// and LuaToVar takes one back.
type OpenGet = ReturnType<typeof go.get>;
const readsMatrix: Matrix4 extends OpenGet ? true : false = true;
void readsMatrix;
declare const matrix: Matrix4;
go.set("#model", "matrix_property", matrix);

// HashTableIndex hashes a string key, so an id table reads by path too.
const ids = collectionfactory.create("#factory");
const spawnedById: Hash = ids.get("/go");
const tree = gui.get_tree(gui.get_node("root"));
const treeNode: Opaque<"node"> = tree.get("box");
const clones = gui.clone_tree(gui.get_node("button"));
const cloneNode: Opaque<"node"> = clones.get("button");
void spawnedById;
void treeNode;
void cloneNode;
