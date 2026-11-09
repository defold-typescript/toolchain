/** @noSelfInFile **/

/**
 * A dissolve effect for sprites. Add a `noise` and a `ramp` image to the sprite's atlas
 * and set `dissolve_fx/materials/sprite.material` as the sprite's material, then call
 * `init` from the script's `init`. The noise drives the dissolve and the ramp colors its
 * burning edge.
 * @see {@link https://github.com/indiesoftby/defold-dissolve-fx|Github Source}
 * @noResolution
 */
declare module 'dissolve_fx.dissolve_fx' {
  /**
   * How a uv rect is scaled to the sprite. `stretch` divides the width by the sprite's
   * width and the height by its height. `cover` divides both by the sprite's larger side.
   */
  export type ScaleMode = "stretch" | "cover";

  /**
   * Finds an image in the sprite's atlas and returns its uv rect in texture space as four
   * values: center x, center y, width and height:
   * `const [x, y, w, h] = dissolve_fx.find_uvrect("#sprite", "noise")`.
   * Upstream asserts that `image_id` is a string, that the atlas holds the image, and that
   * the image is not trimmed (trim mode off, 8 uvs). With `scale_mode`, the width and
   * height are also divided by the size of the sprite's current animation, so the vertex
   * shader can map the noise from local positions.
   * @param sprite_url The sprite component.
   * @param image_id The image's id in the sprite's atlas.
   * @param scale_mode How the width and height are scaled to the sprite. Upstream asserts
   * `stretch` or `cover`. When omitted, they are left in texture space.
   */
  export function find_uvrect(
    sprite_url: string | Hash | Url,
    image_id: string,
    scale_mode?: ScaleMode,
  ): LuaMultiReturn<[number, number, number, number]>;

  /**
   * Sets the sprite's `noise_uvrect` and `ramp_uvrect` from the two images in its atlas.
   * The sprite must use the `dissolve_fx/materials/sprite.material` material. The effect
   * is then driven by the sprite's `dissolve.z` property, the size of the burning edge,
   * and `dissolve.w`, from `0` to `1`, through `go.set` and `go.animate`:
   * `go.animate("#sprite", "dissolve.w", go.PLAYBACK_LOOP_PINGPONG, 1, go.EASING_LINEAR, 3)`.
   * @param sprite_url The sprite component with the dissolve material.
   * @param noise_image The noise image's id in the sprite's atlas.
   * @param ramp_image The ramp image's id in the sprite's atlas.
   * @param noise_scale_mode How the noise is scaled to the sprite. Defaults to `stretch`.
   */
  export function init(
    sprite_url: string | Hash | Url,
    noise_image: string,
    ramp_image: string,
    noise_scale_mode?: ScaleMode,
  ): void;
}
