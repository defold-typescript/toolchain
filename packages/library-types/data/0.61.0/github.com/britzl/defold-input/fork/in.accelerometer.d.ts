/** @noSelfInFile */

/**
 * @see {@link https://github.com/britzl/defold-input|Github Source}
 * @noResolution
 */
declare module 'in.accelerometer' {
	type AccelerometerInstance = {
		reset: () => void;
		calibrate: () => void;
		on_input: (action: { acc_x: number; acc_y: number; acc_z: number }) => void;
		calibrated: () => Vector3;
		adjusted: () => Vector3;
		average: () => Vector3;
		zero: () => Vector3;
		latest: () => Vector3;
		on_window_resized: (width: number, height: number) => void;
	};

	export function create(samplecount?: number): AccelerometerInstance;
	export function reset(instance?: AccelerometerInstance): void;
	export function calibrate(instance?: AccelerometerInstance): void;
	export function on_input(
		action: { acc_x: number; acc_y: number; acc_z: number },
		instance?: AccelerometerInstance,
	): void;
	export function calibrated(instance?: AccelerometerInstance): Vector3;
	export function adjusted(instance?: AccelerometerInstance): Vector3;
	export function average(instance?: AccelerometerInstance): Vector3;
	export function zero(instance?: AccelerometerInstance): Vector3;
	export function latest(instance?: AccelerometerInstance): Vector3;
	export function on_window_resized(
		width: number,
		height: number,
		instance?: AccelerometerInstance,
	): void;
}
