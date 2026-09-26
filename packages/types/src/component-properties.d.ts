/** @noSelfInFile */

import type { Hash } from "./core-types";

// Component property keys upstream examples read through `go.get` while no
// ref-doc catalog declares them. Only evidenced keys belong here.
declare global {
  namespace sprite {
    interface properties {
      /**
       * The texture bound to the sprite's first sampler. Not in the sprite
       * ref-doc; `resource.set`'s example reads it with
       * `go.get("#sprite", "texture0")`.
       */
      texture0: Hash;
    }
  }

  /**
   * Mesh component properties. Upstream ships no mesh API module, so this
   * catalog holds only the keys upstream examples read.
   */
  namespace mesh {
    interface properties {
      /**
       * The buffer resource holding the mesh's vertex data.
       * `resource.get_buffer` and `resource.set_buffer` read it with
       * `go.get("#mesh", "vertices")`.
       */
      vertices: Hash;
    }
  }
}
