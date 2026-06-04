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
      color: Vector4;
      font: Hash;
      leading: number;
      line_break: boolean;
      material: Hash;
      outline: Vector4;
      scale: number | Vector3;
      shadow: Vector4;
      size: Vector3;
      tracking: number;
    }
  }
}

export {};
