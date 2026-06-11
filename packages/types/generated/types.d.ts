/** @noSelfInFile */
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
    function is_hash(var_: unknown): boolean;
    /**
     * Check if passed type is matrix4.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is matrix4
     */
    function is_matrix4(var_: unknown): boolean;
    /**
     * Check if passed type is quaternion.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is quaternion
     */
    function is_quat(var_: unknown): boolean;
    /**
     * Check if passed type is URL.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is URL
     */
    function is_url(var_: unknown): boolean;
    /**
     * Check if passed type is vector.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is vector
     */
    function is_vector(var_: unknown): boolean;
    /**
     * Check if passed type is vector3.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is vector3
     */
    function is_vector3(var_: unknown): boolean;
    /**
     * Check if passed type is vector4.
     *
     * @param var_ - Variable to check type
     * @returns True if passed type is vector4
     */
    function is_vector4(var_: unknown): boolean;
  }
}

export {};
