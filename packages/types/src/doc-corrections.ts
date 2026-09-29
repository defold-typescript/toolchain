import { fnv1a64 } from "./fnv1a";

// A function slot whose upstream doc HTML is malformed badly enough to misread,
// replaced wholesale with authored HTML that keeps upstream's wording. Each
// entry is pinned by the FNV-1a hash of the exact upstream HTML it replaces: the
// parse applies it only while the vendored doc still hashes to that value, so a
// fixed or reworded upstream doc wins by itself, and
// `doc-correction-provenance.test.ts` reds until the stale entry is deleted.
//
// Keyed `<function>#param:<name>` or `<function>#return:<name>`.
export interface DocCorrection {
  readonly upstreamHash: string;
  readonly html: string;
  readonly reason: string;
}

const li = (name: string, type: string, doc: string) =>
  `<li><code>${name}</code> <span class="type">${type}</span> ${doc}</li>`;

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
]);

export function docCorrectionKey(
  functionName: string,
  slot: "param" | "return",
  name: string,
): string {
  return `${functionName}#${slot}:${name}`;
}

// The slot's doc with its correction applied, or `doc` itself when the slot has
// no entry or upstream no longer matches the pinned hash.
export function correctedDoc(key: string, doc: string): string {
  const correction = DOC_CORRECTIONS.get(key);
  return correction && fnv1a64(doc) === correction.upstreamHash ? correction.html : doc;
}
