/** @noSelfInFile */
import type { Hash, Opaque, Url } from "../src/core-types";

declare global {
  namespace b2d {
    type b2Body = Opaque<"b2Body">;
    type b2World = Opaque<"b2World">;
    /**
     * Get the Box2D body from a collision object
     *
     * @param url - the url to the game object collision component
     * @returns the body if successful. Otherwise `nil`.
     */
    function get_body(url: string | Hash | Url): Opaque<"b2Body">;
    /**
     * Get the Box2D world from the current collection
     *
     * @returns the world if successful. Otherwise `nil`.
     */
    function get_world(): Opaque<"b2World">;
  }
}

export {};
