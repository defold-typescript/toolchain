declare global {
  /**
   * Game-object addresses found in the project's scenes — `"/player"`,
   * `"/level/enemy"`, and every other runtime path a `.collection` composes.
   *
   * @remarks
   * The interface ships **empty** and is open: a generator augments it with one
   * key per address it discovered, and editors then offer those keys as
   * completions on every slot typed {@link SceneGameObjectAddress}. With no
   * generator run the interface stays empty, which is exactly today's
   * behavior — the alias is always widened, so nothing is ever rejected.
   *
   * @example
   * ```ts
   * declare global {
   *   interface SceneGameObjectAddresses {
   *     "/player": true;
   *   }
   * }
   * ```
   */
  interface SceneGameObjectAddresses {}

  /**
   * Component addresses found in the project's scenes — `"#sprite"`,
   * `"/player#collisionobject"`, and every other component a game object owns.
   *
   * @remarks
   * Open and empty by default, exactly like {@link SceneGameObjectAddresses};
   * a generator fills it and {@link SceneComponentAddress} reads it. Kept
   * separate from the game-object interface so a slot that can only address a
   * component never suggests a bare game-object path.
   */
  interface SceneComponentAddresses {}

  /**
   * A game-object address: the scene-derived ids as completions, plus every
   * other string.
   *
   * @remarks
   * The trailing `(string & {})` term is load-bearing. It keeps the alias
   * assignable from — and to — an arbitrary `string`, so an address computed at
   * runtime type-checks unchanged while the literal keys still surface as
   * suggestions. A scene-derived type must never turn into a compile error.
   */
  type SceneGameObjectAddress = (keyof SceneGameObjectAddresses & string) | (string & {});

  /**
   * A component address: the scene-derived ids as completions, plus every other
   * string. Never rejects, for the same reason as
   * {@link SceneGameObjectAddress}.
   */
  type SceneComponentAddress = (keyof SceneComponentAddresses & string) | (string & {});

  /**
   * Either kind of address, for a slot that accepts a game object *or* one of
   * its components — `msg.post`'s receiver, `go.get`'s url. Never rejects.
   */
  type SceneAddress = SceneGameObjectAddress | SceneComponentAddress;
}

export {};
