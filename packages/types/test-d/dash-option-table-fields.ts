/// <reference path="../index.d.ts" />
import type { Hash, Opaque, Url, Vector3, Vector4 } from "../src/core-types";

declare const node: Opaque<"node">;
declare const url: string | Hash | Url;
declare const key: Hash;
declare const value: Vector3 | Vector4;

sys.get_sys_info({ ignore_secure: true });

// @ts-expect-error not_an_option is not a recovered field of the sys.get_sys_info options table
sys.get_sys_info({ not_an_option: true });

gui.set(node, hash("tint"), value, { index: 1, key });

// @ts-expect-error bogus is not a recovered field of the gui.set options table
gui.set(node, hash("tint"), value, { bogus: true });

const _position: Vector3 = go.get(url, "position", { index: 1, key });
void _position;

// @ts-expect-error bogus is not a recovered field of the go.get options table
go.get(url, "position", { bogus: true });
