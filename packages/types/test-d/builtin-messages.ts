/// <reference path="../index.d.ts" />
import type { Hash, Matrix4, Url, Vector3, Vector4 } from "../src/core-types";
import { defineScript } from "../src/lifecycle";

const _url = null as unknown as Url;
const _hash = null as unknown as Hash;
const _v3 = null as unknown as Vector3;
const _v4 = null as unknown as Vector4;
const _m4 = null as unknown as Matrix4;

msg.post(_url, "set_parent", { parent_id: _hash, keep_world_transform: 1 });
msg.post(_url, "set_parent", { parent_id: _hash, keep_world_transform: 0 });
msg.post(_url, "set_parent", {});
msg.post(_url, "set_parent");

// @ts-expect-error set_parent payload has no `wrong_field`
msg.post(_url, "set_parent", { wrong_field: 1 });

// @ts-expect-error parent_id must be Hash, not string
msg.post(_url, "set_parent", { parent_id: "not a hash" });

// @ts-expect-error keep_world_transform is 0 | 1, not arbitrary number
msg.post(_url, "set_parent", { keep_world_transform: 2 });

msg.post(_url, "acquire_input_focus");
msg.post(_url, "acquire_input_focus", {});

// @ts-expect-error acquire_input_focus has an empty payload — extra fields are rejected
msg.post(_url, "acquire_input_focus", { foo: 1 });

msg.post(_url, "play_animation", { id: _hash });
msg.post(_url, "play_animation", { id: _hash, offset: 0.5, playback_rate: 2 });
msg.post(_url, "my_custom_message", { anything: 1 });
msg.post(_url, "another_custom", "string payload" as unknown as Record<string, never>);

msg.post(_url, _hash, { parent_id: _hash });

msg.post(_url, "apply_force", { force: _v3, position: _v3 });

// @ts-expect-error force must be Vector3, not number
msg.post(_url, "apply_force", { force: 1, position: _v3 });

// @ts-expect-error apply_force requires force and position
msg.post(_url, "apply_force", {});

const _rayResponse: BuiltinMessages["ray_cast_response"] = {
  fraction: 0,
  position: _v3,
  normal: _v3,
  id: _hash,
  group: _hash,
  request_id: 0,
};
const _rayResponseShape: {
  fraction: number;
  position: Vector3;
  normal: Vector3;
  id: Hash;
  group: Hash;
  request_id: number;
} = _rayResponse;
void _rayResponseShape;

const _rayMissed: BuiltinMessages["ray_cast_missed"] = { request_id: 0 };
const _rayMissedShape: { request_id: number } = _rayMissed;
void _rayMissedShape;

defineScript({
  on_message(_self, message_id, message) {
    if (isMessage(message_id, message, "ray_cast_missed")) {
      // @ts-expect-error ray_cast_missed carries only request_id; the engine sends no group
      void message.group;
    }
    if (isMessage(message_id, message, "collision_response")) {
      const _group: Hash = message.group;
      void _group;
    }
    if (isMessage(message_id, message, "trigger_response")) {
      const _group: Hash = message.group;
      void _group;
    }
  },
});

msg.post(_url, "play_sound", { gain: 1, delay: 0, play_id: 1 });
msg.post(_url, "play_sound", {});

// @ts-expect-error gain must be number
msg.post(_url, "play_sound", { gain: "loud" });

// @ts-expect-error play_sound payload has no `volume` field
msg.post(_url, "play_sound", { volume: 1 });

msg.post(_url, "play_sound", { start_time: 0.5 });
msg.post(_url, "play_sound", { start_frame: 3 });

const _playSoundStartTime: number | undefined =
  null as unknown as BuiltinMessages["play_sound"]["start_time"];
void _playSoundStartTime;

// @ts-expect-error start_time must be number, not string
msg.post(_url, "play_sound", { start_time: "soon" });

msg.post(_url, "play_sound", { pan: 0.5, speed: 2 });

msg.post(_url, "set_gain", { gain: 0.5 });
msg.post(_url, "set_gain", {});

msg.post(_url, "stop_sound");
msg.post(_url, "stop_sound", { play_id: 1 });

msg.post(_url, "pause_sound", { pause: true });
msg.post(_url, "set_pan", { pan: 0 });

msg.post(_url, "set_camera", { aspect_ratio: 16 / 9, fov: 1, near_z: 0.1, far_z: 500 });
msg.post(_url, "reboot", { arg1: "x" });
msg.post(_url, "start_record", { file_name: "a" });

const _soundDone: BuiltinMessages["sound_done"] = { play_id: 0 };
const _soundDoneShape: { play_id: number } = _soundDone;
void _soundDoneShape;

const _soundStopped: BuiltinMessages["sound_stopped"] = { play_id: 0 };
const _soundStoppedShape: { play_id: number } = _soundStopped;
void _soundStoppedShape;

const _modelAnimationDone: BuiltinMessages["model_animation_done"] = {
  animation_id: _hash,
  playback: 0,
};
const _modelAnimationDoneShape: { animation_id: Hash; playback: number } = _modelAnimationDone;
void _modelAnimationDoneShape;

// @ts-expect-error model_animation_done payload has no `current_tile` field
void _modelAnimationDone.current_tile;

msg.post(_url, "set_time_step", { factor: 0.5, mode: 1 });

// @ts-expect-error factor must be number, not string
msg.post(_url, "set_time_step", { factor: "half", mode: 1 });

// @ts-expect-error set_time_step payload has no `speed` field
msg.post(_url, "set_time_step", { factor: 0.5, mode: 1, speed: 1 });

msg.post(_url, "async_load");
msg.post(_url, "proxy_unloaded");

const _setTimeStep: BuiltinMessages["set_time_step"] = { factor: 0.5, mode: 1 };
const _setTimeStepShape: { factor: number; mode: number } = _setTimeStep;
void _setTimeStepShape;

msg.post(_url, "clear_color", { color: _v4 });

// @ts-expect-error clear_color color must be Vector4, not Vector3
msg.post(_url, "clear_color", { color: _v3 });

// @ts-expect-error clear_color payload has no `mode` field
msg.post(_url, "clear_color", { color: _v4, mode: 1 });

msg.post(_url, "draw_line", { start_point: _v3, end_point: _v3, color: _v4 });

// @ts-expect-error draw_line requires color
msg.post(_url, "draw_line", { start_point: _v3, end_point: _v3 });

msg.post(_url, "draw_debug_text", { position: _v3, text: "hp: 100", color: _v4 });

// @ts-expect-error draw_debug_text text must be string, not number
msg.post(_url, "draw_debug_text", { position: _v3, text: 0, color: _v4 });

const _setViewProjection: BuiltinMessages["set_view_projection"] = {
  id: _hash,
  view: _m4,
  projection: _m4,
};
const _setViewProjectionShape: { id: Hash; view: Matrix4; projection: Matrix4 } =
  _setViewProjection;
void _setViewProjectionShape;

const _windowResized: BuiltinMessages["window_resized"] = { height: 0, width: 0 };
const _windowResizedShape: { height: number; width: number } = _windowResized;
void _windowResizedShape;

const _layoutChanged: BuiltinMessages["layout_changed"] = { id: _hash, previous_id: _hash };
const _layoutChangedShape: { id: Hash; previous_id: Hash } = _layoutChanged;
void _layoutChangedShape;

// @ts-expect-error layout_changed id must be Hash, not string
const _layoutChangedBadId: BuiltinMessages["layout_changed"]["id"] = "not a hash";
void _layoutChangedBadId;

// The built-in message catalog is complete with this gui-script slice — the
// remaining Defold component families (factory, label, tilemap, particlefx,
// input) are API/property/on_input-driven, not message-driven.

void _url;
void _hash;
void _v3;
void _v4;
void _m4;
