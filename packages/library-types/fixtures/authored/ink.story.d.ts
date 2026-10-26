/** @noSelfInFile **/

/**
 * @see {@link https://github.com/abadonna/defold-ink|Github Source}
 * @noResolution
 */
declare module 'ink.story' {
  /** A paragraph of story text, with the tags attached to it. */
  export interface Paragraph {
    /** The paragraph text, trimmed. It is empty for a paragraph that only carries tags. */
    text: string;
    /** The tags attached to the paragraph, empty when it has none. */
    tags: string[];
  }

  /** A choice the player can answer with its 1-based index. */
  export interface Answer {
    /** The choice text. */
    text: string;
    /** The tags attached to the choice, empty when it has none. */
    tags: string[];
  }

  /**
   * The saved state of a story, from `get_state`: the player's inputs and the random
   * values the story rolled, so `restore` can replay it.
   */
  export interface StoryState {
    /** The player's inputs, in order: answers, jumps, flow switches and assigned values. */
    input: LuaTable[];
    /** The random values the story rolled, so a replay rolls the same ones. */
    randoms: number[];
  }

  /** The state of a story from `serialize`: its global variables and the visit counts of its containers. */
  export interface SerializedStory {
    /** The story's global variables. */
    globals: LuaTable<string, unknown>;
    /** The visit counts of the story's containers. */
    root: LuaTable;
  }

  /** The paragraphs the story wrote, then the answers the player can choose from. */
  export type StoryOutput = LuaMultiReturn<[Paragraph[], Answer[]]>;

  /**
   * A story instance, created by `create`. Every member is called with `.`
   * (`story.continue(1)`) and none takes the story as `self`.
   * @noSelf
   */
  export interface Story {
    /**
     * A table of all global variables, to read and set. Use `assign_value` to notify
     * observer functions about a change.
     */
    variables: LuaTable<string, unknown>;

    /**
     * Returns the next paragraphs and choices.
     * @param answer The 1-based index of the chosen answer. It is ignored if the story just begins, and required once the story offers choices.
     */
    continue: (answer?: number) => StoryOutput;

    /**
     * Assigns an observer function to a global variable. Each global variable can have
     * multiple observers.
     * @param name The global variable to observe.
     * @param f Called with the variable's new value each time it changes.
     */
    add_observer: (name: string, f: (this: void, value: unknown) => void) => void;

    /**
     * Removes an observer function.
     * @param name The observed global variable.
     * @param f The observer to remove. Without it, every observer of the variable is removed.
     */
    remove_observer: (name: string, f?: (this: void, value: unknown) => void) => void;

    /**
     * Assigns a value to a global variable and calls all its observers.
     * @param name The global variable.
     * @param value Its new value.
     */
    assign_value: (name: string, value: unknown) => void;

    /**
     * Binds a Lua function to an ink external function, which the story then calls
     * with the external function's arguments.
     * @param name The external function's name in the ink script.
     * @param f Called with the external function's arguments. Its result is the external function's return value; `nil` reads as an empty string.
     */
    bind: (name: string, f: (this: void, ...args: any[]) => unknown) => void;

    /**
     * Jumps to a named knot or stitch, and returns its paragraphs and choices.
     * @param path The knot or stitch, as `knot` or `knot.stitch`.
     */
    jump: (path: string) => StoryOutput;

    /**
     * Creates a new parallel flow or switches to an existing one.
     * @param name The flow. Without it, the story goes back to the default flow.
     */
    switch_flow: (name?: string) => void;

    /**
     * Restores the story from a state saved with `get_state`, by replaying it from the
     * start, and returns its last paragraphs and choices. The story should be created
     * from the same, or a similar, JSON.
     * @param state The saved state.
     * @param with_bindings `true` calls the bound external functions during the replay.
     * @param ignore_errors `true` stops the replay at the first saved choice the story no longer offers, instead of raising an error.
     */
    restore: (state: StoryState, with_bindings?: boolean, ignore_errors?: boolean) => StoryOutput;

    /** Returns the current state of the story, to save and pass to `restore` later. */
    get_state: () => StoryState;

    /**
     * Returns the result of evaluating a Lua expression, with the name of every global
     * variable replaced by its value.
     * @param expression The expression to evaluate.
     */
    eval: (expression: string) => unknown;

    /**
     * Returns the story's variables and visit counts, an alternative to `get_state`
     * that survives script changes better. Pass it to `deserialize`, not to `restore`.
     */
    serialize: () => SerializedStory;

    /**
     * Restores the story's variables and visit counts from `serialize`, then jumps to a
     * path and returns its paragraphs and choices.
     * @param data The state from `serialize`.
     * @param path The knot or stitch to jump to, since the story restores only its variables.
     * @param reset_observers `true` drops every observer before the variables are restored; without it, the observers are called with the restored values.
     */
    deserialize: (data: SerializedStory, path: string, reset_observers?: boolean) => StoryOutput;
  }

  /**
   * Parses a compiled ink story and returns a story instance.
   * @param s The ink JSON text, for example from `sys.load_resource`. It must be UTF-8.
   * @returns The story instance.
   */
  export function create(s: string): Story;
}
