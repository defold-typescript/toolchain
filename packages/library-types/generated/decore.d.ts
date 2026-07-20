/** @noResolution */
declare module 'decore.decore' {
	interface world {
		event_bus: decore_event_bus;
		entities: entity[];
		systems: system[];
		speed: number | undefined;
		add?(...args: any[]): unknown;
		addEntity?(...args: any[]): entity;
		addSystem?(...args: any[]): system;
		remove?(...args: any[]): void;
		removeEntity?(...args: any[]): entity;
		removeSystem?(...args: any[]): system;
		refresh?(...args: any[]): void;
		update?(...args: any[]): void;
		fixed_update?(...args: any[]): void;
		late_update?(...args: any[]): void;
		clearEntities?(...args: any[]): void;
		clearSystems?(...args: any[]): void;
		getEntityCount?(...args: any[]): void;
		getSystemCount?(...args: any[]): void;
		setSystemIndex?(...args: any[]): void;
		entitiesToChange: entity[];
		entitiesToRemove: entity[];
		systemsToChange: system[];
		systemsToAdd: system[];
		systemsToRemove: system[];
		findEntities: (world: world, component_id: string, component_value: unknown | undefined) => entity[];
		findEntity: (world: world, component_id: string, component_value: unknown | undefined) => entity | undefined;
	}
	interface decore {
	}
	interface decore_logger {
		trace: (_: unknown, msg: string, data: unknown) => void;
		debug: (_: unknown, msg: string, data: unknown) => void;
		info: (_: unknown, msg: string, data: unknown) => void;
		warn: (_: unknown, msg: string, data: unknown) => void;
		error: (_: unknown, msg: string, data: unknown) => void;
	}
	interface decore_components_data {
		pack_id: string;
		components: LuaTable<string, unknown>;
	}
	interface entity {
		id: number | undefined;
		prefab_id: string | undefined;
		pack_id: string | undefined;
		parent_prefab_id: string | undefined;
		child_instancies: entity | undefined;
		parent_id: number | undefined;
		children_ids: number[] | undefined;
	}
	/**
	 * System Decore class to manage child-parent relationships and default components
	 */
	interface system_decore extends system {
		decore: decore;
		id_to_entity: LuaTable<number, entity>;
		onAddToWorld(world: world): void;
		onRemoveFromWorld(world: world): void;
		onAdd(entity: entity): void;
		onRemove(entity: entity): void;
		spawn_children(entity: entity): void;
		remove_children(entity: entity): void;
		remove_from_parent(entity: entity): void;
	}
	interface system {
		indices: LuaTable<entity, number>;
		id: string;
		filter?(...args: any[]): void;
		active: boolean;
		world: world;
		entities: entity[];
		nocache: boolean;
		index: number;
		modified: boolean;
		interval: number | undefined;
		bufferedTime: number | undefined;
		onAdd?(...args: any[]): void;
		onRemove?(...args: any[]): void;
		onModify?(...args: any[]): void;
		onAddToWorld?(...args: any[]): void;
		onRemoveFromWorld?(...args: any[]): void;
		preWrap: ((system: system, dt: number) => void) | undefined;
		postWrap: ((system: system, dt: number) => void) | undefined;
		update: ((system: system, dt: number) => void) | undefined;
		fixed_update: ((system: system, dt: number) => void) | undefined;
		late_update: ((system: system, dt: number) => void) | undefined;
		preProcess: ((system: system, dt: number) => void) | undefined;
		process: ((system: system, entity: entity, dt: number) => void) | undefined;
		postProcess: ((system: system, dt: number) => void) | undefined;
		compare: ((e1: entity, e2: entity) => void) | undefined;
	}
	interface tiny_ecs_Tiny_ECS_module {
		requireAll: (...args: unknown[]) => unknown;
		requireAny: (...args: unknown[]) => unknown;
		rejectAll: (...args: unknown[]) => unknown;
		rejectAny: (...args: unknown[]) => unknown;
		filter: (pattern: string) => LuaMultiReturn<[unknown, unknown]>;
		system: (table: system | undefined) => system;
		processingSystem: (table: system | undefined) => system;
		sortedSystem: (table: system | undefined) => system;
		sortedProcessingSystem: (table: system | undefined) => system;
		world: (...args: unknown[]) => LuaMultiReturn<[world, unknown]>;
		addEntity: (world: world, entity: entity) => entity;
		addSystem: (world: world, system: system) => system;
		add: (world: world, ...args: unknown[]) => unknown;
		removeEntity: (world: world, entity: entity) => entity;
		removeSystem: (world: world, system: system) => system;
		remove: (world: world, ...args: unknown[]) => unknown;
		refresh: (world: world) => void;
		update: (world: world, dt: number, filter: ((...args: unknown[]) => void) | undefined) => unknown;
		clearEntities: (world: world) => void;
		clearSystems: (world: world) => void;
		getEntityCount: (world: world) => number;
		getSystemCount: (world: world) => number;
		setSystemIndex: (world: world, system: system, index: number) => number;
	}
	interface decore_event_bus {
		events: LuaTable<string, unknown[]>;
		events_by_entity: LuaTable<string, LuaTable<entity, unknown[]>>;
		stash: LuaTable<string, unknown[]>;
		stash_by_entity: LuaTable<string, LuaTable<entity, unknown[]>>;
		merge_callbacks: LuaTable<string, (new_event: unknown, events: unknown[], entity_map: LuaTable<entity, unknown[]>) => boolean>;
		/**
		 * Pushes an event onto the queue, triggering it and processing the queue of callbacks.
		 */
		trigger(event_name: string | Hash, data: unknown): void;
		/**
		 * Processes a specified event, returning the list of events and optionally calling callback with the full list.
		 */
		process(event_name: Hash | string, callback: ((events: unknown[]) => void) | ((context: unknown, events: unknown[]) => void) | undefined, context: unknown | undefined): unknown[] | undefined;
		process_all(): void;
		/**
		 * You can set the merge policy for an event. This is useful when you want to merge events of the same type.
		 */
		set_merge_policy(event_name: string, merge_callback: ((new_event: unknown, events: unknown[], entity_map: LuaTable<entity, unknown[]>) => boolean) | undefined): void;
		clear_events(): void;
		stash_to_events(): void;
		get_events(): void;
		get_stash(event_name: Hash | string): LuaTable[] | undefined;
	}
	/**
	 * System to manage event bus inside the world
	 */
	interface system_bus_event extends system {
		onAddToWorld(): void;
		postWrap(): void;
	}
	/**
	 * Create a new world instance
	 */
	export function new_world(this: void, ...args: (system[] | undefined)[]): world;
	/**
	 * Add window event to the world event bus
	 */
	export function on_message(this: void, world: world, message_id: Hash, message: LuaTable | undefined, sender: Url | undefined): void;
	export function system<T>(this: void, system_module: T, system_id: string, require_all_filters: string | string[] | undefined): T;
	export function processing_system<T>(this: void, system_module: T, system_id: string, require_all_filters: string | string[] | undefined): T;
	export function sorted_system<T>(this: void, system_module: T, system_id: string, require_all_filters: string | string[] | undefined): T;
	export function sorted_processing_system<T>(this: void, system_module: T, system_id: string, require_all_filters: string | string[] | undefined): T;
	/**
	 * Register entity to create it with `create_prefab` function
	 */
	export function register_entity(this: void, entity_id: string, entity_data: LuaTable, pack_id: string | undefined): void;
	/**
	 * Add entities pack to decore entities
	 * If entities pack with same id already loaded, do nothing.
	 * If the same id is used in different packs, the last one will be used in `create_prefab` function
	 */
	export function register_entities(this: void, pack_id: string, entities: LuaTable<string, LuaTable>): void;
	/**
	 * Unload entities pack from decore entities
	 */
	export function unregister_entities(this: void, pack_id: string): void;
	/**
	 * Create new entity instance
	 */
	export function create(this: void, components: LuaTable<string, unknown>): entity;
	/**
	 * Create new entity instance from prefab
	 */
	export function create_prefab(this: void, prefab_id: string | Hash | undefined, pack_id: string | undefined, components: LuaTable<string, unknown> | undefined): entity;
	/**
	 * Register component to decore components
	 */
	export function register_component(this: void, component_id: string, component_data: LuaTable | string | number | boolean, pack_id: string | undefined): void;
	/**
	 * Register components pack to decore components
	 */
	export function register_components(this: void, components_data: decore_components_data): boolean;
	/**
	 * Unload components pack from decore components
	 */
	export function unregister_components(this: void, pack_id: string): void;
	/**
	 * Return new component instance from prefab
	 */
	export function create_component(this: void, component_id: string, component_pack_id: string | undefined): unknown | undefined;
	/**
	 * Add component to entity.
	 * If component not exists, it will be created with default values
	 * If component already exists, it will be merged with the new data
	 * To refresh system filters, call world:addEntity(entity) after this function
	 */
	export function apply_component(this: void, entity: entity, component_id: string, component_data: unknown | undefined): entity;
	/**
	 * Add components to entity
	 * To refresh system filters, call world:addEntity(entity) after this function
	 */
	export function apply_components(this: void, entity: entity, components: LuaTable<string, unknown> | undefined): entity;
	export function get_entity_by_id(this: void, world: world, id: number): entity | undefined;
	/**
	 * Return all entities with component_id equal to component_value or all entities with component_id if component_value is nil.
	 * It looks for component_id in entity and entityToChange tables
	 */
	export function find_entities(this: void, world: world, component_id: string, component_value: unknown | undefined): entity[];
	/**
	 * Log all loaded packs for entities, components and worlds
	 */
	export function print_loaded_packs_debug_info(this: void): void;
	/**
	 * Log all loaded systems
	 */
	export function print_loaded_systems_debug_info(this: void, world: world): void;
	export function set_logger(this: void, logger_instance: decore_logger | LuaTable | undefined): void;
	export function get_logger(this: void, name: string | undefined, level: string | undefined): decore_logger;
}
