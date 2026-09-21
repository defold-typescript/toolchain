/** @noSelfInFile */
import type { Hash, Url } from "./core-types";

declare global {
  /**
   * A `Url` that also names the messages its receiver declares. `__receives` is
   * type-only and never exists at runtime; the value is an ordinary `Url`.
   */
  type ReceiverUrl<M> = Url & { readonly __receives?: M };

  /**
   * The script-local messages a script declares by handling them: each
   * annotated `onMessage` handler key outside the built-in and `CustomMessages`
   * catalogs, mapped to its payload. Read it off the script module's default
   * export and pass it to `msg.url<M>` to get a receiver-typed address.
   *
   * @example
   * ```ts
   * type WaveMessages = ScriptMessages<typeof import("./wave").default>;
   * ```
   */
  type ScriptMessages<T> = T extends { on_message?: infer D }
    ? NonNullable<D> extends { readonly __messages?: infer L }
      ? L extends object
        ? L
        : Record<never, never>
      : Record<never, never>
    : Record<never, never>;

  /**
   * The messages a `msg.post` receiver declares: the `M` of a
   * {@link ReceiverUrl}, or the handled messages of the script a scene address
   * names in `SceneComponentAddresses`. Empty for every other receiver.
   */
  type ReceiverMessages<R> = R extends { readonly __receives?: infer M }
    ? M extends object
      ? M
      : Record<never, never>
    : R extends keyof SceneComponentAddresses
      ? ScriptMessages<SceneComponentAddresses[R]>
      : Record<never, never>;

  namespace msg {
    /**
     * Post a message to a receiving URL. The most common case is to send messages
     * to a component. If the component part of the receiver is omitted, the message
     * is broadcast to all components in the game object.
     * The following receiver shorthands are available:
     *
     * - `"."` the current game object
     *
     * - `"#"` the current component
     *
     * There is a 2 kilobyte limit to the message parameter table size.
     *
     * @param receiver - The receiver must be a string in URL-format, a URL object or a hashed string.
     * @param message_id - The id must be a string or a hashed string.
     * @param message - a lua table with message parameters to send.
     * @example
     * ```ts
     * msg.post("#collisionobject", "apply_force", {
     *   force: vmath.vector3(0, 1000, 0),
     *   position: go.get_world_position(),
     * });
     * ```
     *
     * @remarks
     * The `(string & {})` term keeps every declared message id as a completion
     * while still accepting any other string, so no existing call is rejected.
     *
     * A receiver from `msg.url<M>` also offers and checks the ids in `M`, and a
     * scene address whose generated value is a script module offers and checks
     * that script's handled messages. A built-in id keeps its built-in payload,
     * and any other id stays open.
     *
     * Both receiver routes live in this one signature on purpose: a separate,
     * stricter overload ahead of it would let a mismatched payload fall through
     * to the open one and compile anyway.
     */
    function post<
      R extends SceneAddress | Hash | Url,
      K extends (keyof ReceiverMessages<R> & string) | MessageId | (string & {}),
    >(
      receiver: R,
      message_id: K,
      message?: K extends BuiltinMessageId
        ? MessagePayload<K>
        : K extends keyof ReceiverMessages<R>
          ? ReceiverMessages<R>[K]
          : MessagePayload<K>,
    ): void;
    function post(
      receiver: SceneAddress | Url | Hash,
      message_id: Hash,
      message?: Record<string | number, unknown>,
    ): void;
    /**
     * Construct a URL. A URL is `[socket:][path][#fragment]`.
     *
     * @remarks
     * Only the following arities are supported at runtime:
     *
     * - `msg.url()` — no-arg.
     * - `msg.url("[socket:][path][#fragment]")` — one string, the full URL.
     * - `msg.url(socket, path, fragment)` — three required args.
     *
     * The two-arg form `msg.url(socket, path)` is a runtime error.
     *
     * `socket` may be `undefined` (Lua `nil`), which addresses the current
     * game world, exactly as the runtime's own examples do.
     *
     * The one-argument form's `urlstring` may likewise be `undefined` (Lua
     * `nil`), which the ref-doc calls equivalent to `msg.url()` — the URL of the
     * current script.
     *
     * In the same world, address a sibling **relatively** — by bare id
     * (`msg.url("camera")`), absolute path (`msg.url("/camera")`), or
     * component (`msg.url("#main")`). The `socket:` prefix only crosses
     * into a collection-proxy-loaded world.
     *
     * Pass the receiver's message map as `M` (for example
     * `msg.url<ScriptMessages<typeof import("./wave").default>>("/logic#wave")`)
     * to get a receiver-typed address: `msg.post` then completes and checks
     * those ids. The value is still an ordinary `Url`.
     *
     * @example
     * ```ts
     * // No-arg, then take the current game object's URL.
     * const self: Url = msg.url();
     *
     * // An `undefined` argument is the no-arg form spelled out.
     * const alsoSelf: Url = msg.url(undefined);
     *
     * // A sibling in the same world — bare id, no socket prefix.
     * const sibling: Url = msg.url("camera");
     *
     * // An absolute path in the same world.
     * const absSibling: Url = msg.url("/camera");
     *
     * // A component on a sibling.
     * const comp: Url = msg.url("camera#script");
     *
     * // Crossing into a proxy-loaded world — `socket` is the world name.
     * const proxied: Url = msg.url(hash("level1"), hash("/door"), hash("script"));
     *
     * // An `undefined` socket addresses the current game world.
     * const currentWorld: Url = msg.url(undefined, hash("/door"), hash("script"));
     * ```
     */
    function url(): Url;
    function url(urlstring: SceneAddress | undefined): Url;
    function url(
      socket: string | Hash | undefined,
      path: string | Hash,
      fragment: string | Hash,
    ): Url;
    function url<M extends object>(): ReceiverUrl<M>;
    function url<M extends object>(urlstring: SceneAddress | undefined): ReceiverUrl<M>;
    function url<M extends object>(
      socket: string | Hash | undefined,
      path: string | Hash,
      fragment: string | Hash,
    ): ReceiverUrl<M>;
  }
}
