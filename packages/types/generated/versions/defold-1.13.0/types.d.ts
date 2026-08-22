/** @noSelfInFile */
import type { Hash, Matrix4, Quaternion, Url, Vector, Vector3, Vector4 } from "../../../src/core-types";

declare global {
  /**
   * Functions for checking Defold userdata types.
   */
  namespace types {
    /**
     * Check if passed type is hash.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is hash
     */
    function is_hash(var_: unknown): var_ is Hash;
    /**
     * Check if passed type is matrix4.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is matrix4
     */
    function is_matrix4(var_: unknown): var_ is Matrix4;
    /**
     * Check if passed type is quaternion.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is quaternion
     */
    function is_quat(var_: unknown): var_ is Quaternion;
    /**
     * Check if passed type is URL.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is URL
     */
    function is_url(var_: unknown): var_ is Url;
    /**
     * Check if passed type is vector.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is vector
     */
    function is_vector(var_: unknown): var_ is Vector;
    /**
     * Check if passed type is vector3.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is vector3
     */
    function is_vector3(var_: unknown): var_ is Vector3;
    /**
     * Check if passed type is vector4.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is vector4
     */
    function is_vector4(var_: unknown): var_ is Vector4;
  }
}

export {};
