/** @noResolution */
declare module 'pixelart.scripts.pixelart' {
	interface ShadowSettings {
		projection_width: number;
		projection_height: number;
		projection_near: number;
		projection_far: number;
		depth_bias?: number;
		shadow_opacity?: number;
	}
	interface LightSettings {
		source: string;
		target: string;
		diffuse_light_color?: Vector3;
	}
	interface PixelartSettings {
		pixel_size: number;
		normal_edge_coefficient: number;
		depth_edge_coefficient: number;
	}
	/**
	 * Set shadow depth bias
	 */
	export function set_depth_bias(this: void, depth_bias: number): void;
	/**
	 * Set shadow opacity
	 */
	export function set_shadow_opacity(this: void, shadow_opacity: number): void;
	/**
	 * Set Pixel-art pixel size for post-processing shader
	 */
	export function set_pixel_size(this: void, pixel_size: number): void;
	/**
	 * Set Pixel-art normal edge for sharpening edges
	 */
	export function set_normal_edge(this: void, normal_edge: number): void;
	/**
	 * Set Pixel-art depth edge for outline
	 */
	export function set_depth_edge(this: void, depth_edge: number): void;
	/**
	 * Set Pixel-art models ambient light
	 */
	export function set_ambient_light(this: void, ambient_light: Vector3): void;
	/**
	 * Set Pixel-art resolution for post-processing shader
	 */
	export function set_resolution(this: void, pixel_size: number): void;
	/**
	 * Set Light source and target
	 */
	export function set_light(this: void, light_source: string, light_target: string): void;
	/**
	 * Pixel-art post-process initial setup
	 */
	export function init(this: void, pixel_settings: PixelartSettings, light_settings?: LightSettings, shadow_settings?: ShadowSettings): void;
}
