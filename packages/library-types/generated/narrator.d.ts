/** @noResolution */
declare module 'narrator.narrator' {
	interface Narrator_Book_Version {
		engine: number;
		tree: number;
	}
	interface Narrator_Book {
		version: Narrator_Book_Version;
		inclusions: string[];
		lists: LuaTable;
		constants: LuaTable;
		variables: LuaTable;
		params: LuaTable;
		tree: LuaTable;
	}
	interface Narrator_ParsingParams {
		save: boolean;
	}
	interface Narrator_Paragraph {
		text: string;
		tags?: string[] | undefined;
	}
	interface Narrator_Choice {
		text: string;
		tags?: string[] | undefined;
	}
	interface Narrator_State {
		version: number;
		temp: LuaTable;
		seeds: LuaTable;
		variables: LuaTable;
		params?: LuaTable | undefined;
		visits: LuaTable;
		current_path: LuaTable;
		paragraphs: LuaTable;
		choices: LuaTable;
		output: LuaTable;
		tunnels?: LuaTable | undefined;
		path: LuaTable;
	}
	interface Object {
		"new"(): void;
		extend(): void;
		implement(): void;
		is(): void;
		__tostring(): void;
		__call(): void;
	}
	interface constructor {
		add_node(): void;
		add_inclusion(): void;
		add_list(): void;
		add_constant(): void;
		add_variable(): void;
		add_function(): void;
		add_knot(): void;
		add_stitch(): void;
		add_switch(): void;
		add_sequence(): void;
		add_return(): void;
		add_assignment(): void;
		add_paragraph(): void;
		add_choice(): void;
		add_item(): void;
		compute_variable(): void;
		compute_variables(): void;
	}
	interface Narrator_Story {
		global_tags: string[];
		constants: LuaTable<string, unknown>;
		variables: LuaTable<string, unknown>;
		migrate: (state: Narrator_State, old_version: number, new_version: number) => Narrator_State;
		/**
		 * Start a story
		 * Generate the first chunk of paragraphs and choices
		 */
		begin(): void;
		/**
		 * Does the story have paragraphs to output or not
		 */
		can_continue(): boolean;
		/**
		 * Pull the current paragraphs from the queue.
		 */
		"continue"(steps?: number | undefined): Narrator_Paragraph[];
		/**
		 * Does the story have choices to output or not.
		 * Also returns false if there are available paragraphs to continue.
		 */
		can_choose(): boolean;
		/**
		 * Returns an array of available choice titles.
		 * Also returns an empty array if there are available paragraphs to continue.
		 */
		get_choices(): Narrator_Choice[];
		/**
		 * Make a choice to continue the story.
		 */
		choose(index: number): void;
		/**
		 * Jump to the path
		 */
		jump_to(path_string: string): void;
		/**
		 * Get the number of visits for the path.
		 */
		get_visits(path_string: string): number;
		/**
		 * Get tags for the path
		 */
		get_tags(path_string?: string | undefined): string[];
		/**
		 * Creates a table with the story state that can be saved and loaded later.
		 * Use it to save the game.
		 */
		save_state(): Narrator_State;
		/**
		 * Restore the story state from the saved state.
		 * Use it to load the game.
		 */
		load_state(state: Narrator_State): void;
		/**
		 * Assign an observer function to the variable's changes.
		 */
		observe(variable: string, observer: (variable: unknown) => void): void;
		/**
		 * Bind a function to external calling from the Ink.
		 * The function can returns the value or not.
		 */
		bind(func_name: string, handler: (...args: unknown[]) => unknown): void;
	}
	/**
	 * Parse a book from an Ink file
	 * Use it during development, but prefer already parsed and stored books in production
	 * Requires `lpeg` and `io`.
	 */
	export function parse_file(this: void, path: string, params?: Narrator_ParsingParams | undefined): Narrator_Book;
	/**
	 * Parse a book from the ink content string
	 * Use it during development, but prefer already parsed and stored books in production
	 * Requires `lpeg`
	 */
	export function parse_content(this: void, content: string, inclusions: string[]): Narrator_Book;
	/**
	 * Init a story based on the book
	 */
	export function init_story(this: void, book: Narrator_Book): Narrator_Story;
}
