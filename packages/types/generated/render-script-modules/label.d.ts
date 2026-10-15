/** @noSelfInFile */
import type { Hash, Vector3, Vector4 } from "../../src/core-types";

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
       * unscaled lower-left x-coordinate relative to the label's pivot
       */
      x: number;
      /**
       * unscaled lower-left y-coordinate relative to the label's pivot
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
