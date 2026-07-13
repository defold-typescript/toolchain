import type { Hash, Matrix4, Vector3, Vector4 } from "../src/core-types";

declare global {
  interface BuiltinMessages {
    /** @deprecated since 1.13.0 */
    acquire_camera_focus: Record<string, never>;
    acquire_input_focus: Record<string, never>;
    animation_done: { current_tile: number; id: Hash };
    apply_force: { force: Vector3; position: Vector3 };
    async_load: Record<string, never>;
    clear_color: { color: Vector4 };
    collision_event: { a: Record<string | number, unknown>; b: Record<string | number, unknown> };
    collision_response: { other_id: Hash; other_position: Vector3; other_group: Hash; own_group: Hash };
    contact_point_event: { applied_impulse: number; distance: number; a: Record<string | number, unknown>; b: Record<string | number, unknown> };
    contact_point_response: { position: Vector3; normal: Vector3; relative_velocity: Vector3; distance: number; applied_impulse: number; life_time: number; mass: number; other_mass: number; other_id: Hash; other_position: Vector3; other_group: Hash; own_group: Hash };
    disable: Record<string, never>;
    draw_debug_text: { position: Vector3; text: string; color: Vector4 };
    draw_line: { start_point: Vector3; end_point: Vector3; color: Vector4 };
    enable: Record<string, never>;
    exit: { code: number };
    final: Record<string, never>;
    init: Record<string, never>;
    layout_changed: { id: Hash; previous_id: Hash };
    load: Record<string, never>;
    model_animation_done: { animation_id: Hash; playback: number };
    play_animation: { id: Hash };
    play_sound: { delay?: number; gain?: number; play_id?: number; start_time?: number; start_frame?: number };
    proxy_loaded: Record<string, never>;
    proxy_unloaded: Record<string, never>;
    ray_cast_missed: { group: Hash; request_id: number };
    ray_cast_response: { fraction: number; position: Vector3; normal: Vector3; id: Hash; group: Hash; request_id: number };
    reboot: { arg1: string; arg2: string; arg3: string; arg4: string; arg5: string; arg6: string };
    /** @deprecated since 1.13.0 */
    release_camera_focus: Record<string, never>;
    release_input_focus: Record<string, never>;
    resize: { height: number; width: number };
    resume_rendering: Record<string, never>;
    set_camera: { aspect_ratio: number; fov: number; near_z: number; far_z: number; orthographic_projection: boolean; orthographic_zoom: number; orthographic_mode: number };
    set_gain: { gain: number };
    set_parent: { parent_id?: Hash; keep_world_transform?: 0 | 1 };
    set_time_step: { factor: number; mode: number };
    set_update_frequency: { frequency: number };
    set_view_projection: { id: Hash; view: Matrix4; projection: Matrix4 };
    set_vsync: { swap_interval: number };
    sound_done: { play_id: number };
    sound_stopped: { play_id: number };
    start_record: { file_name: string; frame_period: number; fps: number };
    stop_record: Record<string, never>;
    stop_sound: Record<string, never>;
    toggle_physics_debug: Record<string, never>;
    toggle_profile: Record<string, never>;
    trigger_event: { enter: boolean; a: Record<string | number, unknown>; b: Record<string | number, unknown> };
    trigger_response: { other_id: Hash; enter: boolean; other_group: Hash; own_group: Hash };
    unload: Record<string, never>;
    window_resized: { height: number; width: number };
  }
  type BuiltinMessageId = keyof BuiltinMessages;
}

export {};
