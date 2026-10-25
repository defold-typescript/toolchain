/** @noSelfInFile */
/** @deprecated Import it: import * as uuid4 from "uuid4" */
declare const uuid4: typeof import("uuid4");

/**
 * Random version 4 UUID generator, based on
 * {@link https://github.com/gpakosz/uuid4|gpakosz/uuid4}.
 *
 * @see {@link https://github.com/selimanac/defold-uuid4|Github Source}
 */
/** @globalTable */
declare module "uuid4" {
  /**
   * Generates a version 4 UUID.
   *
   * @returns The UUID as a string.
   */
  function generate(): string;
}
