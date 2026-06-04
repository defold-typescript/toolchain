/** @noSelfInFile */
import type { Hash, Url, Vector3, Vector4 } from "../src/core-types";

declare global {
  namespace label {
    /**
     * Gets the text from a label component
     *
     * @param url - the label to get the text from
     * @returns the label text
     */
    function get_text(url: string | Hash | Url): string;
    /**
     * Sets the text of a label component
     * This method uses the message passing that means the value will be set after `dispatch messages` step.
     * More information is available in the Application Lifecycle manual.
     *
     * @param url - the label that should have a constant set
     * @param text - the text
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
       * The scale of the label. The type of the property is number (uniform)
       * or vector3 (non uniform).
       */
      scale: number | Vector3;
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
       * The tracking of the label.
       * This value is used to adjust the vertical spacing of characters in the text.
       * The type of the property is number.
       */
      tracking: number;
    }
  }
}

export {};
