/** @noSelfInFile **/

/**
 * @see {@link https://github.com/Dragosha/defold-sprite-repeat|Github Source}
 * @noResolution
 * @example `import * as sprite_repeat from 'sprite_repeat.sprite_repeat'`
 */
declare module 'sprite_repeat.sprite_repeat' {
	/**
	 * One frame of the atlas animation, with the UV rectangle and size the repeat
	 * material reads.
	 */
	export interface RepeatFrame {
		/** The frame's UV rectangle in the texture: `x`/`y` one corner, `z`/`w` the other. */
		uv_coord: Vector4;
		/** The frame's width in texture pixels. */
		w: number;
		/** The frame's height in texture pixels. */
		h: number;
		/** `(0, 1, 0, 0)` when the atlas stores the frame rotated clockwise, else `(1, 0, 0, 0)`. */
		uv_rotated: Vector4;
	}

	/**
	 * The handle `create` returns. It holds the frames read from the atlas and drives
	 * the sprite's `uv_coord`, `uv_rotated` and `uv_repeat` material constants.
	 * @noSelf
	 */
	export interface SpriteRepeatAnimation {
		/** Every frame of the animation, in playback order. */
		frames: RepeatFrame[];
		/** The animation's width, from the atlas. */
		width: number;
		/** The animation's height, from the atlas. */
		height: number;
		/** The animation's playback rate, from the atlas. */
		fps: number;
		/** The 1-based index of the frame shown next. */
		current_frame: number;
		/** The `uv_repeat` value: `x`/`y` the repeat factors, `z`/`w` the current frame's size. */
		v: Vector4;
		/** The `timer.delay` handle driving playback. Present only while a multi-frame animation plays. */
		handle?: number;
		/**
		 * Applies the first frame and the repeat factors to the sprite. When the
		 * animation has more than one frame and a non-zero `fps`, starts a repeating
		 * timer that steps through the frames.
		 * @param repeat_x How many times the image repeats horizontally.
		 * @param repeat_y How many times the image repeats vertically.
		 */
		animate(repeat_x: number, repeat_y: number): void;
		/** Cancels the playback timer, if one is running. */
		stop(): void;
	}

	/**
	 * Reads an atlas animation's frames for a sprite that uses the repeat material,
	 * and returns a handle that applies them. Apply the repeat material to the sprite
	 * first, and disable sprite trim mode for the atlas images: every frame must have
	 * exactly 8 UV values, or this asserts. Walks the atlas animation's frame list,
	 * so it needs Defold 1.12.3 or later.
	 * @param sprite_url The sprite component.
	 * @param sprite_id The atlas animation to read. When omitted, the sprite's current
	 * `animation` is used.
	 * @param self The calling script's `self`. When it already holds `atlas_data` and
	 * `tex_info`, they are reused instead of read again; otherwise they are read and
	 * stored on it, so later calls for sprites sharing the atlas skip the lookup.
	 */
	function create(
		sprite_url: Url | Hash | string,
		sprite_id?: Hash | string,
		self?: {
			atlas_data?: ReturnType<typeof resource.get_atlas>;
			tex_info?: ReturnType<typeof resource.get_texture_info>;
		},
	): SpriteRepeatAnimation;
}
