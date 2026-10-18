import { fnv1a64 } from "./fnv1a";

// A function slot whose upstream doc HTML is malformed badly enough to misread,
// replaced wholesale with authored HTML that keeps upstream's wording, or a
// function or property doc that contradicts what the engine does. Each
// entry is pinned by the FNV-1a hash of the exact upstream HTML it replaces: the
// parse applies it only while the vendored doc still hashes to that value, so a
// fixed or reworded upstream doc wins by itself, and
// `doc-correction-provenance.test.ts` reds until the stale entry is deleted.
//
// Keyed `<function>#param:<name>`, `<function>#return:<name>`, `<function>#brief`,
// `<function>#description`, or `<namespace>#property:<name>` (the ref-doc
// `PROPERTY` element's bare name).
export interface DocCorrection {
  readonly upstreamHash: string;
  readonly html: string;
  readonly reason: string;
}

const li = (name: string, type: string, doc: string) =>
  `<li><code>${name}</code> <span class="type">${type}</span> ${doc}</li>`;

const GET_BYTES_REASON =
  "script_buffer.cpp:GetBytes reads only argument 1 with CheckBufferUnpack and pushes every byte of the buffer, so no stream is selected";

export const DOC_CORRECTIONS: ReadonlyMap<string, DocCorrection> = new Map([
  [
    "graphics.get_adapter_info#return:info",
    {
      upstreamHash: "77028e82ec2d15bd",
      reason:
        "script_graphics.cpp indents the field table as preformatted text: the top-level fields run together as one paragraph, and the `limits` and `features` sub-tables are highlighted as code",
      html: [
        "table with the following fields:",
        "<ul>",
        li("family", "string", 'adapter family name (e.g. "opengl", "vulkan")'),
        li("version_major", "number", "adapter API major version (e.g. 1 for Vulkan 1.4)"),
        li("version_minor", "number", "adapter API minor version (e.g. 4 for Vulkan 1.4)"),
        `<li><code>limits</code> <span class="type">table</span> hardware/driver limits:<ul>`,
        li("max_texture_size_2d", "number", "max 2D texture dimension in texels"),
        li("max_texture_size_3d", "number", "max 3D (volume) texture dimension in texels"),
        li("max_texture_size_cube", "number", "max cube map face dimension in texels"),
        li("max_texture_array_layers", "number", "max layers in an array texture"),
        li("max_framebuffer_width", "number", "max framebuffer width in pixels"),
        li("max_framebuffer_height", "number", "max framebuffer height in pixels"),
        li("max_color_attachments", "number", "max simultaneous color attachments"),
        li("max_samplers_per_stage", "number", "max texture samplers per shader stage"),
        li("max_textures_per_stage", "number", "max sampled textures per shader stage"),
        li("max_vertex_attributes", "number", "max vertex attributes"),
        li("max_vertex_buffers", "number", "max vertex buffer bindings"),
        li("max_compute_workgroup_size_x", "number", "max compute workgroup size (X)"),
        li("max_compute_workgroup_size_y", "number", "max compute workgroup size (Y)"),
        li("max_compute_workgroup_size_z", "number", "max compute workgroup size (Z)"),
        li("max_compute_workgroup_invocations", "number", "max invocations per compute workgroup"),
        li(
          "max_compute_shared_memory_size",
          "number",
          "max shared memory per compute workgroup (bytes)",
        ),
        li("max_uniform_buffer_range", "number", "max bindable uniform buffer range (bytes)"),
        li("max_storage_buffer_range", "number", "max bindable storage buffer range (bytes)"),
        "</ul></li>",
        li("extensions", "table", "array of driver-reported extension name strings"),
        `<li><code>features</code> <span class="type">table</span> array of supported context feature ids:<ul>`,
        "<li><code>graphics.CONTEXT_FEATURE_MULTI_TARGET_RENDERING</code> multi-target rendering</li>",
        "<li><code>graphics.CONTEXT_FEATURE_TEXTURE_ARRAY</code> texture arrays</li>",
        "<li><code>graphics.CONTEXT_FEATURE_COMPUTE_SHADER</code> compute shaders</li>",
        "<li><code>graphics.CONTEXT_FEATURE_STORAGE_BUFFER</code> storage buffers</li>",
        "<li><code>graphics.CONTEXT_FEATURE_VSYNC</code> vertical sync</li>",
        "<li><code>graphics.CONTEXT_FEATURE_INSTANCING</code> hardware instancing</li>",
        "<li><code>graphics.CONTEXT_FEATURE_3D_TEXTURES</code> 3D (volume) textures</li>",
        "<li><code>graphics.CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES</code> ASTC compressed 2D array textures</li>",
        "<li><code>graphics.CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX</code> min/max blend equations</li>",
        "</ul></li>",
        "</ul>",
      ].join("\n"),
    },
  ],
  [
    "go#property:scale",
    {
      upstreamHash: "a7f5ba1b125d1fae",
      reason:
        "upstream calls it a uniform number, but the engine reads a vector3 back from `go.get` and applies a written number as a uniform scale",
      html: "The scale of the game object. <code>go.get</code> returns a vector3; <code>go.set</code> and <code>go.animate</code> also take a number, which sets a uniform scale.",
    },
  ],
  [
    "label#property:scale",
    {
      upstreamHash: "5a15760073a8629d",
      reason:
        'upstream says a number is accepted, but `go.set` raises "must be a vmath.vector3" on one; only `go.animate` takes a number',
      html: "The scale of the label. <code>go.get</code> returns and <code>go.set</code> takes a vector3; <code>go.animate</code> also takes a number, which sets a uniform scale.",
    },
  ],
  [
    "model#property:textureN",
    {
      upstreamHash: "d6b885cb54de309f",
      reason:
        "the engine handles texture units 0-15 on 1.12.4 and later (render.h `MAX_TEXTURE_COUNT = 16`), while upstream's 0-7 holds on 1.11.0 and earlier, so the text names no range",
      html: "The texture hash id of the model, read and written on the texture unit the key's number names (<code>texture3</code> is unit 3).",
    },
  ],
  [
    "buffer.get_bytes#brief",
    {
      upstreamHash: "e30a9df6b7f4f67d",
      reason: GET_BYTES_REASON,
      html: "gets all the bytes of a buffer",
    },
  ],
  [
    "buffer.get_bytes#description",
    {
      upstreamHash: "0f16f8e9dce4eb3a",
      reason: GET_BYTES_REASON,
      html: "Get a copy of all the bytes of the buffer, every stream included, as a Lua string.",
    },
  ],
  [
    "buffer.get_bytes#param:stream_name",
    {
      upstreamHash: "cfd40e4525c59409",
      reason: GET_BYTES_REASON,
      html: "the name of the stream; the engine ignores it and returns every byte of the buffer",
    },
  ],
  [
    "gui.clone_tree#param:node",
    {
      upstreamHash: "5c72743d24931629",
      reason:
        "gui_script.cpp:LuaCloneTree tests argument 1 with lua_isnil after pushing its result table, so nil selects the whole scene and an absent argument raises",
      html: "root node to clone, or <code>nil</code> to clone the whole scene; leaving the argument out raises an error",
    },
  ],
  [
    "gui.get_tree#param:node",
    {
      upstreamHash: "47ef2cdd6bf46434",
      reason:
        "gui_script.cpp:LuaGetTree tests argument 1 with lua_isnil after pushing its result table, so nil selects the whole scene and an absent argument raises",
      html: "root node to get node tree from, or <code>nil</code> to get the whole scene; leaving the argument out raises an error",
    },
  ],
]);

export function docCorrectionKey(owner: string, slot: "brief" | "description"): string;
export function docCorrectionKey(
  owner: string,
  slot: "param" | "return" | "property",
  name: string,
): string;
export function docCorrectionKey(owner: string, slot: string, name?: string): string {
  return name === undefined ? `${owner}#${slot}` : `${owner}#${slot}:${name}`;
}

// The slot's doc with its correction applied, or `doc` itself when the slot has
// no entry or upstream no longer matches the pinned hash.
export function correctedDoc(key: string, doc: string): string {
  const correction = DOC_CORRECTIONS.get(key);
  return correction && fnv1a64(doc) === correction.upstreamHash ? correction.html : doc;
}
