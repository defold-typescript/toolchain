/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as constants from "light_and_shadows.constants";
import * as light from "light_and_shadows.light";
import * as light_and_shadows from "light_and_shadows.light_and_shadows";

// Compile-only proof for the light-and-shadows forks, written as the calls upstream's
// README and bundled scripts make. No assertions execute; the `dts-declaration-validity`
// compile is the gate.

export function render_hooks(self: object): void {
  light_and_shadows.init(self);
  light_and_shadows.update(self);
  light_and_shadows.draw_upscaled(self);
}

export function depth_of_field(): void {
  light_and_shadows.dof(true, { blur_power: 2, upscale: false, blur_resolution: 1 });
  light_and_shadows.dof(false);
  // @ts-expect-error `dof` sets `blur_resolution` from the options with no fallback, so a table without it leaves the setting nil
  light_and_shadows.dof(true, { blur_power: 2, upscale: false });
  // @ts-expect-error `enable` is a boolean
  light_and_shadows.dof("yes");

  const blur: number = light_and_shadows.blur_power;
  void blur;
  light_and_shadows.focus.z = 1.5;

  const target = light_and_shadows.render_target("main_rt", 960, 640);
  const rt: render.RenderTarget = target.rt;
  void rt;
}

export function camera(self: object, rot: Quaternion, look_at: Vector3, pos: Vector3): void {
  light.set_position(rot, look_at, pos, 100);
  light.set_position(rot, look_at, pos);
  light.set_color(vmath.vector4(0.1, 0.1, 0.5, 1), vmath.vector4(20, 120, 1, 0));
  light.update(self, 0.016);
  const z: number = light.cam_z;
  void z;
}

export function settings(): void {
  constants.fog.x = 20;
  const near: number = constants.near_z;
  void near;
  const first = constants.lights[0];
  if (first !== undefined) {
    const power: number = first.power;
    void power;
  }
  // @ts-expect-error `near_z` is a number
  const wrong: string = constants.near_z;
  void wrong;
}
