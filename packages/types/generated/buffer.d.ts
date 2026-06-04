/** @noSelfInFile */
import type { Hash, Opaque } from "../src/core-types";

declare global {
  namespace buffer {
    const VALUE_TYPE_FLOAT32: number & { readonly __brand: "buffer.VALUE_TYPE_FLOAT32" };
    const VALUE_TYPE_INT16: number & { readonly __brand: "buffer.VALUE_TYPE_INT16" };
    const VALUE_TYPE_INT32: number & { readonly __brand: "buffer.VALUE_TYPE_INT32" };
    const VALUE_TYPE_INT64: number & { readonly __brand: "buffer.VALUE_TYPE_INT64" };
    const VALUE_TYPE_INT8: number & { readonly __brand: "buffer.VALUE_TYPE_INT8" };
    const VALUE_TYPE_UINT16: number & { readonly __brand: "buffer.VALUE_TYPE_UINT16" };
    const VALUE_TYPE_UINT32: number & { readonly __brand: "buffer.VALUE_TYPE_UINT32" };
    const VALUE_TYPE_UINT64: number & { readonly __brand: "buffer.VALUE_TYPE_UINT64" };
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
     */
    function copy_stream(dst: Opaque<"bufferstream">, dstoffset: number, src: Opaque<"bufferstream">, srcoffset: number, count: number): void;
    /**
     * Create a new data buffer containing a specified set of streams. A data buffer
     * can contain one or more streams with typed data. This is useful for managing
     * compound data, for instance a vertex buffer could contain separate streams for
     * vertex position, color, normal etc.
     *
     * @param element_count - The number of elements the buffer should hold
     * @param declaration - A table where each entry (table) describes a stream
  - hash | string `name`: The name of the stream
  - constant `type`: The data type of the stream
  - number `count`: The number of values each element should hold
     * @returns the new buffer
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
     */
    function get_metadata(buf: Opaque<"buffer">, metadata_name: Hash | string): LuaMultiReturn<[number[] | unknown, Opaque<"constant"> | unknown]>;
    /**
     * Get a specified stream from a buffer.
     *
     * @param buffer - the buffer to get the stream from
     * @param stream_name - the stream name
     * @returns the data stream
     */
    function get_stream(buffer: Opaque<"buffer">, stream_name: Hash | string): Opaque<"bufferstream">;
    /**
     * Creates or updates a metadata array entry on a buffer.
     * The value type and count given when updating the entry should match those used when first creating it.
     *
     * @param buf - the buffer to set the metadata on
     * @param metadata_name - name of the metadata entry
     * @param values - actual metadata, an array of numeric values
     * @param value_type - type of values when stored
     */
    function set_metadata(buf: Opaque<"buffer">, metadata_name: Hash | string, values: number[], value_type: Opaque<"constant">): void;
  }
}

export {};
