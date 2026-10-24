/** @noResolution */
declare module 'quest.quest' {
	import type { event, queue } from 'event.event';
	/**
	 * Quest event types
	 */
	type quest_event_type = "register" | "start" | "progress" | "task_completed" | "completed";
	/**
	 * Contains a quest config required to describe a quest
	 */
	interface quest_config {
		tasks: quest_task[];
		required_quests?: string[] | string | undefined;
		category?: string | undefined;
		events_offline?: boolean | undefined;
		autostart?: boolean | undefined;
		autofinish?: boolean | undefined;
		repeatable?: boolean | undefined;
		use_max_task_value?: boolean | undefined;
	}
	/**
	 * Describes a task for the quest
	 */
	interface quest_task {
		action: string;
		object?: string | undefined;
		required?: number | undefined;
		initial?: number | undefined;
	}
	/**
	 * Quest event data structure
	 */
	interface quest_event_data {
		type: quest_event_type;
		quest_id: string;
		quest_config: quest_config;
		delta?: number | undefined;
		total?: number | undefined;
		/**
		 * Task index (for "progress" and "task_completed" types). **⚠️ 1-based; passed to `quest` unchanged.**
		 */
		task_index?: number | undefined;
	}
	/**
	 * Single queue for all quest events in proper order: register -> start -> progress -> task_completed -> completed
	 */
	interface quest_queue_quest_event extends queue {
	}
	/**
	 * Triggered when a quest can be started.
	 * You can add additional conditions to the quest start validation.
	 * Callback is fun(quest_id: string, quest_config: quest.config): boolean
	 */
	interface quest_event_is_can_start extends event {
	}
	/**
	 * Triggered when a quest can be completed.
	 * You can add additional conditions to the quest completion validation.
	 * Callback is fun(quest_id: string, quest_config: quest.config): boolean
	 */
	interface quest_event_is_can_complete extends event {
	}
	/**
	 * Triggered when a quest can be processed.
	 * You can add additional conditions to the quest event processing.
	 * Callback is fun(quest_id: string, quest_config: quest.config): boolean
	 */
	interface quest_event_is_can_event extends event {
	}
	interface quest_logger {
		trace: (_: unknown, msg: string, data: unknown) => void;
		debug: (_: unknown, msg: string, data: unknown) => void;
		info: (_: unknown, msg: string, data: unknown) => void;
		warn: (_: unknown, msg: string, data: unknown) => void;
		error: (_: unknown, msg: string, data: unknown) => void;
	}
	/**
	 * Persist data between game sessions
	 */
	interface quest_state {
		current: LuaTable<string, quest_progress>;
		completed: string[];
	}
	/**
	 * Describes a quest progress data, used to save quest progress
	 */
	interface quest_progress {
		progress: number[];
		is_active: boolean;
		start_time: number;
	}
	/**
	 * Single queue for all quest events in proper order: register -> start -> progress -> task_completed -> completed
	 */
	export const on_quest_event: quest_queue_quest_event;
	/**
	 * Triggered when a quest can be started.
	 * You can add additional conditions to the quest start validation.
	 * Callback is fun(quest_id: string, quest_config: quest.config): boolean
	 */
	export const is_can_start: quest_event_is_can_start;
	/**
	 * Triggered when a quest can be completed.
	 * You can add additional conditions to the quest completion validation.
	 * Callback is fun(quest_id: string, quest_config: quest.config): boolean
	 */
	export const is_can_complete: quest_event_is_can_complete;
	/**
	 * Triggered when a quest can be processed.
	 * You can add additional conditions to the quest event processing.
	 * Callback is fun(quest_id: string, quest_config: quest.config): boolean
	 */
	export const is_can_event: quest_event_is_can_event;
	/**
	 * Set state (for saving/loading)
	 */
	export function set_state(this: void, external_state: quest_state): void;
	/**
	 * Get state (for saving/loading)
	 */
	export function get_state(this: void): quest_state;
	/**
	 * Initialize quest system with config and start processing quests
	 * quest.init()
	 * quest.init(require("game.quests"))
	 * quest.init("/resources/quests.json")
	 */
	export function init(this: void, quest_config_or_path?: LuaMap<string, quest_config> | Record<string, quest_config> | string | undefined): void;
	/**
	 * Add quests to the system from config file or table
	 * quest.add_quests(require("game.quests"))
	 * quest.add_quests("/resources/quests.json")
	 */
	export function add_quests(this: void, quest_config_or_path: LuaMap<string, quest_config> | Record<string, quest_config> | string): void;
	/**
	 * Main function to apply event to all current quests. Call it when specific quest action is performed.
	 * quest.event("game_started")
	 * quest.event("kill", "enemy")
	 * quest.event("kill", "enemy", 2)
	 * quest.event("collect", "coin", 3)
	 */
	export function event(this: void, action: string, object?: string | undefined, amount?: number | undefined): void;
	/**
	 * Add progress to task
	 *
	 * @param task_index - Task index. **⚠️ 1-based; passed to `quest` unchanged.**
	 */
	export function add_task_progress(this: void, quest_id: string, task_index: number, amount: number): void;
	/**
	 * Check quest is active
	 */
	export function is_active(this: void, quest_id: string): boolean;
	/**
	 * Check quest is completed
	 */
	export function is_completed(this: void, quest_id: string): boolean;
	/**
	 * Check quest is can be started now
	 */
	export function is_can_start_quest(this: void, quest_id: string): boolean;
	/**
	 * Check quest is can be completed now
	 */
	export function is_can_complete_quest(this: void, quest_id: string): boolean;
	/**
	 * Get current progress on quest tasks.
	 * Returns an array-like table with task progress values.
	 * local progress = quest.get_progress("kill_enemies")
	 * print(progress[1]) -- Progress on first task
	 * print(progress[2]) -- Progress on second task
	 * --
	 * local progress = quest.get_progress("nonexistent_quest")
	 * print(#progress) -- Will be 0 for non-existent quests
	 */
	export function get_progress(this: void, quest_id: string): LuaTable<number, number>;
	/**
	 * Get task progress by task index
	 *
	 * @param task_index - **⚠️ 1-based; passed to `quest` unchanged.**
	 */
	export function get_task_progress(this: void, quest_id: string, task_index: number): number;
	/**
	 * Start quest, if it can be started
	 */
	export function start_quest(this: void, quest_id: string): boolean;
	/**
	 * Complete quest, if it can be completed
	 */
	export function complete_quest(this: void, quest_id: string): void;
	/**
	 * Force complete quest, without checking conditions
	 */
	export function force_complete_quest(this: void, quest_id: string): void;
	/**
	 * Reset quest progress
	 */
	export function reset_progress(this: void, quest_id: string): void;
	/**
	 * Reset quest, remove from current and completed lists, and update can be started list
	 */
	export function reset_quest(this: void, quest_id: string): void;
	/**
	 * Clear all quest progress
	 */
	export function clear_all_progress(this: void): void;
	/**
	 * Get current active quests
	 */
	export function get_current(this: void, category?: string | undefined): LuaTable<string, quest_progress>;
	/**
	 * Get completed quests map
	 */
	export function get_completed(this: void, category?: string | undefined): LuaTable<string, boolean>;
	/**
	 * Get quests that can be started
	 */
	export function get_can_be_started(this: void, category?: string | undefined): LuaTable<string, boolean>;
	/**
	 * Get quest config by id
	 */
	export function get_quest_config(this: void, quest_id: string): quest_config;
	/**
	 * Get current quests that have tasks matching the specified action and object.
	 * Returns an array of quest IDs that contain matching tasks.
	 * local quests = quest.is_current_with_task("kill", "enemy")
	 * if #quests > 0 then
	 * print("Found " .. #quests .. " quests with kill enemy task")
	 * end
	 * --
	 * local quests = quest.is_current_with_task("collect")
	 * for i, quest_id in ipairs(quests) do
	 * print("Quest " .. quest_id .. " has collect task")
	 * end
	 */
	export function get_current_with_task(this: void, action: string, object?: string | undefined): string[];
	/**
	 * Customize the logging mechanism used by Quest Module. You can use **Defold Log** library or provide a custom logger.
	 */
	export function set_logger(this: void, logger_instance?: quest_logger | LuaTable | undefined): void;
	/**
	 * Reset Module quest state, probably you want to use it only in case of soft game reload
	 */
	export function reset_state(this: void): void;
	/**
	 * Get quests data
	 */
	export function get_quests_data(this: void): LuaTable<string, quest_config>;
	/**
	 * Get total quests count in quests config
	 */
	export function get_quests_count(this: void): number;
}
