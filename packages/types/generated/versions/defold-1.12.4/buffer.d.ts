/** @noSelfInFile */
import type { Hash, Opaque } from "../../../src/core-types";

declare global {
  /**
   * Functions for manipulating buffers and streams
   */
  namespace buffer {
    /**
     * Float, single precision, 4 bytes
     */
    const VALUE_TYPE_FLOAT32: number & { readonly __brand: "buffer.VALUE_TYPE_FLOAT32" };
    /**
     * Signed integer, 2 bytes
     */
    const VALUE_TYPE_INT16: number & { readonly __brand: "buffer.VALUE_TYPE_INT16" };
    /**
     * Signed integer, 4 bytes
     */
    const VALUE_TYPE_INT32: number & { readonly __brand: "buffer.VALUE_TYPE_INT32" };
    /**
     * Signed integer, 8 bytes
     */
    const VALUE_TYPE_INT64: number & { readonly __brand: "buffer.VALUE_TYPE_INT64" };
    /**
     * Signed integer, 1 byte
     */
    const VALUE_TYPE_INT8: number & { readonly __brand: "buffer.VALUE_TYPE_INT8" };
    /**
     * Unsigned integer, 2 bytes
     */
    const VALUE_TYPE_UINT16: number & { readonly __brand: "buffer.VALUE_TYPE_UINT16" };
    /**
     * Unsigned integer, 4 bytes
     */
    const VALUE_TYPE_UINT32: number & { readonly __brand: "buffer.VALUE_TYPE_UINT32" };
    /**
     * Unsigned integer, 8 bytes
     */
    const VALUE_TYPE_UINT64: number & { readonly __brand: "buffer.VALUE_TYPE_UINT64" };
    /**
     * Unsigned integer, 1 byte
     */
    const VALUE_TYPE_UINT8: number & { readonly __brand: "buffer.VALUE_TYPE_UINT8" };
    /**
     * Copy all data streams from one buffer to another, element wise.
     * Each of the source streams must have a matching stream in the
     * destination buffer. The streams must match in both type and size.
     * The source and destination buffer can be the same.
     *
     * @param dst - the destination buffer
     * @param dstoffset - the offset to start copying data to
     * @param src - the source data buffer
     * @param srcoffset - the offset to start copying data from
     * @param count - the number of elements to copy
     * @example
     * ```ts
     * // How to copy elements (e.g. vertices) from one buffer to another
     * // copy entire buffer
     * buffer.copy_buffer(dstbuffer, 0, srcbuffer, 0, srcbuffer.length);
     *
     * // copy last 10 elements to the front of another buffer
     * buffer.copy_buffer(dstbuffer, 0, srcbuffer, srcbuffer.length - 10, 10);
     * ```
     */
    function copy_buffer(dst: Opaque<"buffer">, dstoffset: number, src: Opaque<"buffer">, srcoffset: number, count: number): void;
    /**
     * Copy a specified amount of data from one stream to another.
     * The value type and size must match between source and destination streams.
     * The source and destination streams can be the same.
     *
     * @param dst - the destination stream
     * @param dstoffset - the offset to start copying data to (measured in value type)
     * @param src - the source data stream
     * @param srcoffset - the offset to start copying data from (measured in value type)
     * @param count - the number of values to copy (measured in value type)
     * @example
     * ```ts
     * // How to update a texture of a sprite:
     * // copy entire stream
     * const srcstream = buffer.get_stream(srcbuffer, hash("xyz"));
     * const dststream = buffer.get_stream(dstbuffer, hash("xyz"));
     * buffer.copy_stream(dststream, 0, srcstream, 0, srcstream.length);
     * ```
     */
    function copy_stream(dst: Opaque<"bufferstream"> & { [index: number]: number }, dstoffset: number, src: Opaque<"bufferstream"> & { [index: number]: number }, srcoffset: number, count: number): void;
    /**
     * Create a new data buffer containing a specified set of streams. A data buffer
     * can contain one or more streams with typed data. This is useful for managing
     * compound data, for instance a vertex buffer could contain separate streams for
     * vertex position, color, normal etc.
     *
     * @param element_count - The number of elements the buffer should hold
     * @param declaration - A table where each entry (table) describes a stream
     *
     * - hash | string `name`: The name of the stream
     *
     * - constant `type`: The data type of the stream
     *
     * - number `count`: The number of values each element should hold
     * @returns the new buffer
     * @example
     * ```ts
     * // How to create and initialize a buffer
     * export default defineScript({
     *   init(self) {
     *     const size = 128;
     *     self.image = buffer.create(size * size, [{ name: hash("rgb"), type: buffer.VALUE_TYPE_UINT8, count: 3 }]);
     *     self.imagestream = buffer.get_stream(self.image, hash("rgb"));
     *
     *     for (let y = 0; y < self.height; y++) {
     *       for (let x = 0; x < self.width; x++) {
     *         const index = y * self.width * 3 + x * 3;
     *         self.imagestream[index + 0] = self.r;
     *         self.imagestream[index + 1] = self.g;
     *         self.imagestream[index + 2] = self.b;
     *       }
     *     }
     *   },
     * });
     * ```
     */
    function create(element_count: number, declaration: { name?: Hash | string; type?: Opaque<"constant">; count?: number }): Opaque<"buffer">;
    /**
     * Get a copy of all the bytes from a specified stream as a Lua string.
     *
     * @param buffer - the source buffer
     * @param stream_name - the name of the stream
     * @returns the buffer data as a Lua string
     */
    function get_bytes(buffer: Opaque<"buffer">, stream_name: Hash): string;
    /**
     * Get a named metadata entry from a buffer along with its type.
     *
     * @param buf - the buffer to get the metadata from
     * @param metadata_name - name of the metadata entry
     * @example
     * ```ts
     * // How to get a metadata entry from a buffer
     * // retrieve a metadata entry named "somefloats" and its numeric type
     * const [values, type] = buffer.get_metadata(buf, hash("somefloats"));
     * if (values) print(`${values.length} values in 'somefloats'`);
     * ```
     */
    function get_metadata(buf: Opaque<"buffer">, metadata_name: Hash | string): LuaMultiReturn<[number[] | unknown, Opaque<"constant"> | unknown]>;
    /**
     * Get a specified stream from a buffer.
     *
     * @param buffer - the buffer to get the stream from
     * @param stream_name - the stream name
     * @returns the data stream
     */
    function get_stream(buffer: Opaque<"buffer">, stream_name: Hash | string): Opaque<"bufferstream"> & { [index: number]: number };
    /**
     * Creates or updates a metadata array entry on a buffer.
     * The value type and count given when updating the entry should match those used when first creating it.
     *
     * @param buf - the buffer to set the metadata on
     * @param metadata_name - name of the metadata entry
     * @param values - actual metadata, an array of numeric values
     * @param value_type - type of values when stored
     * @example
     * ```ts
     * // How to set a metadata entry on a buffer
     * // create a new metadata entry with three floats
     * buffer.set_metadata(buf, hash("somefloats"), [1.5, 3.2, 7.9], buffer.VALUE_TYPE_FLOAT32);
     * // ...
     * // update to a new set of values
     * buffer.set_metadata(buf, hash("somefloats"), [-2.5, 10.0, 32.2], buffer.VALUE_TYPE_FLOAT32);
     * ```
     */
    function set_metadata(buf: Opaque<"buffer">, metadata_name: Hash | string, values: number[], value_type: Opaque<"constant">): void;
  }
}

export {};
