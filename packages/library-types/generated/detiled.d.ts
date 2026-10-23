/** @noResolution */
declare module 'detiled.detiled' {
	type detiled_layers = LuaTable<string, detiled_layer_data>;
	interface detiled {
	}
	interface detiled_tileset {
		"class": string;
		columns: number;
		image?: string | undefined;
		fillmode: string;
		grid: detiled_tileset_grid;
		margin: number;
		name: string;
		objectalignment: string;
		spacing: number;
		tilecount: number;
		tiledversion: string;
		tileheight: number;
		tiles: detiled_tileset_tile[];
		tilewidth: number;
		transformations: detiled_tileset_transformations;
		type: string;
		version: string;
	}
	interface detiled_tileset_grid {
		height: number;
		orientation: string;
		width: number;
	}
	interface detiled_tileset_tile {
		"class": string;
		type: string;
		id: number;
		image: string;
		imageheight: number;
		imagewidth: number;
		objectgroup?: detiled_tileset_objectgroup | undefined;
		properties: detiled_map_property[];
	}
	interface detiled_tileset_objectgroup {
		visible: boolean;
		id: number;
		name: string;
		draworder: string;
		opacity: number;
		type: string;
		x: number;
		y: number;
		objects: detiled_tileset_objectgroup_object[];
	}
	interface detiled_tileset_objectgroup_object {
		visible: boolean;
		id: number;
		name: string;
		point?: boolean | undefined;
		width: number;
		height: number;
		x: number;
		y: number;
		"class": string;
		rotation: number;
	}
	interface detiled_tileset_transformations {
		hflip: boolean;
		preferuntransformed: boolean;
		rotate: boolean;
		vflip: boolean;
	}
	interface detiled_map {
		"class": string;
		compressionlevel: number;
		height: number;
		infinite: boolean;
		layers: detiled_map_layer[];
		nextlayerid: number;
		nextobjectid: number;
		orientation: string;
		renderorder: string;
		tiledversion: string;
		tileheight: number;
		tilesets: detiled_map_tileset[];
		tilewidth: number;
		type: string;
		version: string;
		width: number;
		staggeraxis: string;
		staggerindex: string;
		hexsidelength: number;
	}
	interface detiled_map_layer {
		data: number[];
		encoding: string;
		compression: string;
		height: number;
		id: number;
		name: string;
		offsetx: number;
		offsety: number;
		opacity: number;
		properties: detiled_map_property[];
		type: string;
		visible: boolean;
		width: number;
		x: number;
		y: number;
		draworder: string;
		objects: detiled_map_object[];
	}
	interface detiled_map_property {
		name: string;
		type: string;
		value: string | LuaTable;
		propertytype?: string | undefined;
	}
	interface detiled_map_object {
		"class": string;
		ellipse?: boolean | undefined;
		gid: number;
		height: number;
		id: number;
		name: string;
		point?: boolean | undefined;
		polygon?: LuaTable | undefined;
		polyline?: LuaTable | undefined;
		properties: detiled_map_property[];
		objectgroup: unknown;
		rotation: number;
		type?: string | undefined;
		visible: boolean;
		width: number;
		x: number;
		y: number;
	}
	interface detiled_map_tileset {
		firstgid: number;
		source: string;
	}
	interface detiled_entity_transform {
		position_x: number;
		position_y: number;
		position_z: number;
		scale_x: number;
		scale_y: number;
		size_x?: number | undefined;
		size_y?: number | undefined;
		rotation?: number | undefined;
	}
	interface detiled_entity {
		prefab_id?: string | undefined;
		image?: string | undefined;
		transform: detiled_entity_transform;
		tiled_id?: number | undefined;
		tiled_layer_id?: string | undefined;
		name?: string | undefined;
		object_type?: string | undefined;
		polyline?: LuaTable | undefined;
		polygon?: LuaTable | undefined;
	}
	interface detiled_layer_data {
		entities: detiled_entity[];
		properties: detiled_map_property[];
		layer_id: string;
		visible: boolean;
		position_x: number;
		position_y: number;
		position_z: number;
	}
	interface detiled_map_params_tile {
		width: number;
		height: number;
		side?: number | undefined;
	}
	interface detiled_map_params_scene {
		invert_y: boolean;
		tiles_x: number;
		tiles_y: number;
		size_x: number;
		size_y: number;
		hexmap_type?: string | undefined;
		stagger_index?: string | undefined;
		stagger_axis?: string | undefined;
	}
	interface detiled_map_params {
		orientation: string;
		tile: detiled_map_params_tile;
		scene: detiled_map_params_scene;
	}
	interface detiled_grid {
		get_map_params_from_tiled: (tiled_data: detiled_map) => detiled_map_params;
		cell_to_pos: (i: number, j: number, map_params: detiled_map_params) => LuaMultiReturn<[number, number]>;
		pos_to_cell: (x: number, y: number, map_params: detiled_map_params) => LuaMultiReturn<[number, number]>;
		get_tile_pos: (i: number, j: number, z_layer: number | undefined, map_params: detiled_map_params) => LuaMultiReturn<[number, number, number]>;
		convert_object_position?: (x: number, y: number, map_params: detiled_map_params) => LuaMultiReturn<[number, number]>;
	}
	interface detiled_logger {
		trace: (_: unknown, msg: string, data: unknown) => void;
		debug: (_: unknown, msg: string, data: unknown) => void;
		info: (_: unknown, msg: string, data: unknown) => void;
		warn: (_: unknown, msg: string, data: unknown) => void;
		error: (_: unknown, msg: string, data: unknown) => void;
	}
	interface detiled_grid_hexagonal_flattop extends detiled_grid {
	}
	interface detiled_grid_hexagonal_pointytop extends detiled_grid {
	}
	interface detiled_grid_hexagonal extends detiled_grid {
	}
	interface detiled_grid_isometric extends detiled_grid {
	}
	interface detiled_grid_staggered extends detiled_grid {
	}
	interface detiled_grid_orthogonal extends detiled_grid {
	}
	/**
	 * Set a logger instance
	 */
	export function set_logger(this: void, logger_instance?: detiled_logger | LuaTable | undefined): void;
	/**
	 * Get layers and map params from a map. Each layer has entities, properties, layer_id, visible, position (offset).
	 */
	export function parse(this: void, map_or_path: detiled_map | string): LuaMultiReturn<[detiled_layers, detiled_map_params | undefined]>;
	/**
	 * Convert cell indices to world position
	 */
	export function cell_to_pos(this: void, i: number, j: number, map_params: detiled_map_params): LuaMultiReturn<[number, number]>;
	/**
	 * Convert world position to cell indices
	 */
	export function pos_to_cell(this: void, x: number, y: number, map_params: detiled_map_params): LuaMultiReturn<[number, number]>;
	/**
	 * Load a tileset to internal cache, so maps can reference it by name while parsing
	 */
	export function load_tileset(this: void, tileset_or_path: detiled_tileset | string): detiled_tileset;
}
