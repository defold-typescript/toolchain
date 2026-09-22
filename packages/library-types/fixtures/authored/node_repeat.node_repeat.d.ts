/** @noSelfInFile **/

/**
 * @see {@link https://github.com/Dragosha/defold-sprite-repeat|Github Source}
 * @noResolution
 * @example `import * as node_repeat from 'node_repeat.node_repeat'`
 */
declare module 'node_repeat.node_repeat' {
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
	 * the node's `uv_coord` and `uv_repeat` material constants.
	 * @noSelf
	 */
	export interface NodeRepeatAnimation {
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
		/** The box node the animation drives. */
		node: Opaque<"node">;
		/** The `timer.delay` handle driving playback. Present only while a multi-frame animation plays. */
		handle?: number;
		/**
		 * Applies the first frame and the repeat factors to the node. When the
		 * animation has more than one frame and a non-zero `fps`, starts a repeating
		 * timer that steps through the frames.
		 * @param repeat_x How many times the image repeats horizontally.
		 * @param repeat_y How many times the image repeats vertically.
		 */
		animate(repeat_x: number, repeat_y: number): void;
		/** Cancels the playback timer, if one is running. */
		stop(): void;
		/**
		 * Changes the repeat factors and applies them to the node. A factor left out
		 * keeps its current value.
		 * @param repeat_x How many times the image repeats horizontally.
		 * @param repeat_y How many times the image repeats vertically.
		 */
		update(repeat_x?: number, repeat_y?: number): void;
	}

	/**
	 * The horizontal stretch of the window relative to the GUI's design size, divided
	 * by the smaller of the two stretches. Starts at `1`; `get_screen_aspect_ratio`
	 * updates it.
	 */
	export let x_ratio: number;

	/**
	 * The vertical stretch of the window relative to the GUI's design size, divided by
	 * the smaller of the two stretches. Starts at `1`; `get_screen_aspect_ratio`
	 * updates it.
	 */
	export let y_ratio: number;

	/**
	 * Reads an atlas animation's frames for a GUI box node that uses the repeat
	 * material, and returns a handle that applies them. Call it from a GUI script.
	 * Apply the repeat material to the node first, and disable sprite trim mode for
	 * the atlas images: every frame must have exactly 8 UV values, or this asserts.
	 * Walks the atlas animation's frame list, so it needs Defold 1.12.3 or later.
	 * @param node_or_string The box node, or its id.
	 * @param animation_id The atlas animation to read. Pass `undefined` to use the
	 * node's current flipbook.
	 * @param atlas_path The atlas resource path, passed to `resource.get_atlas`. Asserted
	 * present.
	 */
	function create(
		node_or_string: Opaque<"node"> | string,
		animation_id: Hash | string | undefined,
		atlas_path: Hash | string,
	): NodeRepeatAnimation;

	/**
	 * Measures how the window is stretched relative to the GUI's design size, stores
	 * the result in `x_ratio` and `y_ratio`, and returns it. The smaller ratio is
	 * always `1`. Call it from a GUI script.
	 * @returns The horizontal and vertical ratios.
	 */
	function get_screen_aspect_ratio(): LuaMultiReturn<[number, number]>;
}
