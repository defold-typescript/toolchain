/** @noSelfInFile */

/**
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.state' {
	type StateInstance = {
		acquire: () => void;
		release: (url?: Url) => void;
		is_pressed: (action_id: Hash | string) => boolean | undefined;
		on_input: (
			action_id: Hash | string | undefined,
			action: Partial<go.on_input.Action>,
		) => void;
		clear: () => void;
	};

	export function create(): StateInstance;
	export function acquire(url: Url, instance?: StateInstance): void;
	export function release(url: Url, instance?: StateInstance): void;
	export function is_pressed(
		action_id: Hash | string,
		instance?: StateInstance,
	): boolean | undefined;
	export function update(
		action_id: Hash | string | undefined,
		action: Partial<go.on_input.Action>,
		instance?: StateInstance,
	): void;
	export function on_input(
		action_id: Hash | string | undefined,
		action: Partial<go.on_input.Action>,
		instance?: StateInstance,
	): void;
	export function clear(instance?: StateInstance): void;
}
