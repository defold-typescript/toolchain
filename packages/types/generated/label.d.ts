/** @noSelfInFile */
import type { Hash, Url, Vector3, Vector4 } from "../src/core-types";

declare global {
  /**
   * Label API documentation
   */
  namespace label {
    /**
     * Rich-text layout object
     */
    interface layout_object {
      /**
       * object type, currently `link` or `sprite`
       */
      type: string;
      /**
       * the object's `id` attribute, or its generated layout object id
       */
      id: Hash;
      /**
       * zero-based UTF-32 offset in the visible text
       */
      text_offset: number;
      /**
       * visible UTF-32 text length covered by the object
       */
      text_length: number;
      /**
       * lower-left x-coordinate relative to the label's upper-left layout origin
       */
      x: number;
      /**
       * lower-left y-coordinate relative to the label's upper-left layout origin
       */
      y: number;
      /**
       * resolved object width
       */
      width: number;
      /**
       * resolved object height
       */
      height: number;
      /**
       * markup attributes keyed by name
       */
      attributes: LuaTable<string, string>;
    }
    /**
     * Returns the sprites and links found in the label's current layout.
     * Each entry contains `type`, `id`, the zero-based UTF-32 `text_offset`,
     * `text_length`, resolved `x`, `y`, `width`
     * and `height`, and an `attributes` table. The position is the lower-left
     * object corner relative to the label's upper-left layout origin.
     * Inline resource rendering is not part of this MVP; sprites use their explicit
     * dimensions or a one-em square fallback.
     *
     * @param url - the label to inspect
     * @returns layout objects in source order. **0️⃣ `text_offset` is 0-based; passed to Defold unchanged.**
     * @example
     * ```ts
     * const objects = label.get_layout_objects("#label");
     * for (const object of objects) {
     *   if (object.type === "link") {
     *     print(object.attributes.get("src"), object.text_offset, object.text_length);
     *   } else if (object.type === "sprite") {
     *     print(object.attributes.get("src"), object.x, object.y, object.width, object.height);
     *   }
     * }
     * ```
     */
    function get_layout_objects(url: string | Hash | Url): label.layout_object[];
    /**
     * Gets the text from a label component
     * This function is deprecated. Use `go.get("#label", "text")` instead.
     *
     * @param url - the label to get the text from
     * @returns the label text
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const text = go.get<label.properties>()("#label", "text");
     *     print(text);
     *   },
     * });
     * ```
     */
    function get_text(url: string | Hash | Url): string;
    /**
     * Sets the text of a label component
     * This function is deprecated. Use `go.set("#label", "text", value)` instead.
     * This method uses the message passing that means the value will be set after `dispatch messages` step.
     * More information is available in the Application Lifecycle manual.
     *
     * @param url - the label that should have a constant set
     * @param text - the text
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     go.set<label.properties>()("#label", "text", "Hello World!");
     *   },
     * });
     * ```
     */
    function set_text(url: string | Hash | Url, text: string | number): void;
    interface properties {
      /**
       * The color of the label. The type of the property is vector4.
       */
      color: Vector4;
      /**
       * The font used when rendering the label. The type of the property is hash.
       */
      font: Hash;
      /**
       * The leading of the label. This value is used to scale the line spacing of text.
       * The type of the property is number.
       */
      leading: number;
      /**
       * The line break of the label.
       * This value is used to adjust the vertical spacing of characters in the text.
       * The type of the property is boolean.
       */
      line_break: boolean;
      /**
       * The material used when rendering the label. The type of the property is hash.
       */
      material: Hash;
      /**
       * The outline color of the label. The type of the property is vector4.
       */
      outline: Vector4;
      /**
       * The scale of the label. `go.get` returns and `go.set` takes a vector3; `go.animate` also takes a number, which sets a uniform scale.
       */
      scale: Vector3;
      /**
       * The shadow color of the label. The type of the property is vector4.
       */
      shadow: Vector4;
      /**
       * Returns the size of the label. The size will constrain the text if line break is enabled.
       * The type of the property is vector3.
       */
      size: Vector3;
      /**
       * The text of the label.
       */
      text: string;
      /**
       * The tracking of the label.
       * This value is used to adjust the vertical spacing of characters in the text.
       * The type of the property is number.
       */
      tracking: number;
    }
  }
}

export {};
