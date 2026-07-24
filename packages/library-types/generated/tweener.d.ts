/** @noResolution */
declare module 'tweener.tweener' {
	type easing_function = ((current: number, from: number, to: number, time: number) => number) | string | Opaque<"constant"> | number[];
	/**
	 * Describe a struct of tween object returned by the `tweener.tween` function
	 */
	interface tween {
		timer_id: number;
		is_paused: boolean;
	}
	/**
	 * A tweener module to manage tweening operations. Tween functions are based on the Defold timer.delay function.
	 * Use `tweener.tween` to create a tween, and `tweener.ease` to get the result of an easing function.
	 * You can track the final call of tween by last parameter of the callback function.
	 */
	interface tweener {
	}
	/**
	 * Starts a tweening operation. Return a tween object to manage the tween.
	 */
	export function tween(this: void, easing_function: easing_function, from: number, to: number, time: number | undefined, callback: (value: number, is_end: boolean, time_elapsed: number, time_total: number) => void, update_delta_time: number | undefined): tween;
	/**
	 * Returns the result of an easing function.
	 */
	export function ease(this: void, easing_function: easing_function, from: number, to: number, time: number | undefined, time_elapsed: number): number;
	/**
	 * Check if a tween exists
	 */
	export function is_active(this: void, tween: tween): boolean;
	/**
	 * Cancel a previous running tween.
	 */
	export function cancel(this: void, tween: tween | undefined): boolean;
	/**
	 * Check if a tween is paused
	 */
	export function is_paused(this: void, tween: tween): boolean;
	/**
	 * Sets the pause on a running tween.
	 */
	export function set_pause(this: void, tween: tween, is_paused: boolean): void;
	export function custom_ease(this: void, easing: number[], t: number, b: number, c: number, d: number): number;
}
