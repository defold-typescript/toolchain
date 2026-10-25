/** @noSelfInFile */
/**
 * Player2 AI NPCs: chat completions and spawned NPCs that talk, served by
 * the Player2 desktop app, which must be running at the configured host
 * (`player2_endpoints.host` in game.project, `http://localhost:4315` by
 * default). Every request runs on its own thread; its callbacks run from the
 * extension's update, each called with the requesting script's `self` first.
 *
 * All four NPC calls read their request path from the
 * `player2_endpoints.npc_spawn` setting; the `npc_chat`, `npc_kill` and
 * `npc_responses` settings are never read. A `game_id` reaches only the
 * {@link ainpc.npc_responses} path: the other NPC calls always send the
 * literal `{game_id}` placeholder.
 *
 * @see {@link https://github.com/elefant-ai/player2-ai-npc-defold|Github Source}
 */
/** @globalTable */
declare module "ainpc" {
  /** A value a request body can hold. */
  type JsonValue =
    | string
    | number
    | boolean
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue };

  /** A request body, sent as a JSON object. */
  type Body = Record<string, JsonValue>;

  /**
   * A reply: the decoded JSON when the response is `application/json` and
   * parses, otherwise the raw text. A JSON `null` arrives as `undefined`.
   */
  type Reply = Record<string | number, unknown> | string | number | boolean | undefined;

  /** Called with the reply when the request succeeds. */
  type ReplyCallback = (self: unknown, reply: Reply) => void;

  /**
   * Called when the request fails, with the response body and its HTTP
   * status, or with a message and `-1` when no connection was made.
   */
  type FailCallback = (self: unknown, body: string, status: number) => void;

  /**
   * Requests a chat completion. A string is sent as one user message: the
   * extension pastes it into `{"messages":[{"content":"<text>","role":"user"}]}`
   * without escaping, so text holding a quote, a backslash or a newline makes
   * invalid JSON. Pass a body with a `messages` list to send arbitrary text.
   *
   * @param body - The request body, or the text of one user message.
   * @param on_reply - Called with the completion.
   * @param on_fail - Called when the request fails.
   */
  function chat_completion(
    body: Body | string,
    on_reply: ReplyCallback,
    on_fail: FailCallback,
  ): void;

  /**
   * Spawns an NPC.
   *
   * @param body - The NPC definition, such as the `name`, `short_name`,
   * `character_description`, `system_prompt` and `voice_id` the upstream
   * example sends.
   * @param on_reply - Called with the spawn reply.
   * @param on_fail - Called when the request fails.
   */
  function npc_spawn(body: Body, on_reply: ReplyCallback, on_fail: FailCallback): void;

  /**
   * Spawns an NPC from a body given as a table or as JSON text.
   *
   * @param game_id - Accepted but not sent: the request path keeps the
   * literal `{game_id}` placeholder. This form is the only one that takes the
   * body as JSON text.
   * @param body - The NPC definition, or JSON text sent as it is.
   * @param on_reply - Called with the spawn reply.
   * @param on_fail - Called when the request fails.
   */
  function npc_spawn(
    game_id: string,
    body: Body | string,
    on_reply: ReplyCallback,
    on_fail: FailCallback,
  ): void;

  /**
   * Sends a message to a spawned NPC.
   *
   * @param npc_id - The NPC to talk to.
   * @param body - The message, such as the `sender_message`, `sender_name`
   * and `game_state_info` the upstream example sends.
   * @param on_reply - Called with the chat reply.
   * @param on_fail - Called when the request fails.
   */
  function npc_chat(
    npc_id: string,
    body: Body,
    on_reply: ReplyCallback,
    on_fail: FailCallback,
  ): void;

  /**
   * Sends a message to a spawned NPC, given as a body or as text.
   *
   * @param game_id - Accepted but not sent: the request path keeps the
   * literal `{game_id}` placeholder.
   * @param npc_id - The NPC to talk to.
   * @param body - The message body, or text sent as
   * `{ sender_message = text, sender_name = "" }`.
   * @param on_reply - Called with the chat reply.
   * @param on_fail - Called when the request fails.
   */
  function npc_chat(
    game_id: string,
    npc_id: string,
    body: Body | string,
    on_reply: ReplyCallback,
    on_fail: FailCallback,
  ): void;

  /**
   * Removes a spawned NPC.
   *
   * @param npc_id - The NPC to remove.
   * @param on_reply - Called when the NPC is removed.
   * @param on_fail - Called when the request fails.
   */
  function npc_kill(npc_id: string, on_reply: ReplyCallback, on_fail: FailCallback): void;

  /**
   * Removes a spawned NPC.
   *
   * @param game_id - Accepted but not sent: the request path keeps the
   * literal `{game_id}` placeholder.
   * @param npc_id - The NPC to remove.
   * @param on_reply - Called when the NPC is removed.
   * @param on_fail - Called when the request fails.
   */
  function npc_kill(
    game_id: string,
    npc_id: string,
    on_reply: ReplyCallback,
    on_fail: FailCallback,
  ): void;

  /**
   * Opens the stream of NPC responses. Without a `game_id` the request path
   * keeps the literal `{game_id}` placeholder.
   *
   * @param on_receive - Called with each chunk the stream delivers, decoded
   * as JSON when it parses, otherwise as text.
   * @param on_finish - Called when the stream ends, after `on_fail` when it
   * failed.
   * @param on_fail - Called when the stream fails.
   * @returns The stream id, for {@link ainpc.stop_npc_responses}.
   */
  function npc_responses(
    on_receive: ReplyCallback,
    on_finish: (self: unknown) => void,
    on_fail: FailCallback,
  ): number;

  /**
   * Opens the stream of NPC responses for a game.
   *
   * @param game_id - The game whose responses to stream; it replaces
   * `{game_id}` in the request path.
   * @param on_receive - Called with each chunk the stream delivers, decoded
   * as JSON when it parses, otherwise as text.
   * @param on_finish - Called when the stream ends, after `on_fail` when it
   * failed.
   * @param on_fail - Called when the stream fails.
   * @returns The stream id, for {@link ainpc.stop_npc_responses}.
   */
  function npc_responses(
    game_id: string,
    on_receive: ReplyCallback,
    on_finish: (self: unknown) => void,
    on_fail: FailCallback,
  ): number;

  /**
   * Stops a stream opened by {@link ainpc.npc_responses}. An id that names
   * no open stream is ignored.
   *
   * @param stream_id - The id `npc_responses` returned.
   */
  function stop_npc_responses(stream_id: number): void;
}
