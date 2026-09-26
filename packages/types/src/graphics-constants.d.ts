/** @noSelfInFile */

// The engine registers these vertex-attribute semantic types on `graphics`, and
// `material.set_vertex_attributes` documents them, but no ref-doc element
// declares them.
declare global {
  namespace graphics {
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_NONE: number & { readonly __brand: "graphics.SEMANTIC_TYPE_NONE" };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_POSITION: number & { readonly __brand: "graphics.SEMANTIC_TYPE_POSITION" };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_TEXCOORD: number & { readonly __brand: "graphics.SEMANTIC_TYPE_TEXCOORD" };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_PAGE_INDEX: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_PAGE_INDEX";
    };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_COLOR: number & { readonly __brand: "graphics.SEMANTIC_TYPE_COLOR" };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_NORMAL: number & { readonly __brand: "graphics.SEMANTIC_TYPE_NORMAL" };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_TANGENT: number & { readonly __brand: "graphics.SEMANTIC_TYPE_TANGENT" };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_WORLD_MATRIX: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_WORLD_MATRIX";
    };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_NORMAL_MATRIX: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_NORMAL_MATRIX";
    };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_BONE_WEIGHTS: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_BONE_WEIGHTS";
    };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_BONE_INDICES: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_BONE_INDICES";
    };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D";
    };
    /** Vertex attribute semantic type, for `material.set_vertex_attributes`. */
    const SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS: number & {
      readonly __brand: "graphics.SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS";
    };
  }
}

export {};
