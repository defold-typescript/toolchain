/** @noSelfInFile */

import type { Hash, Vector3 } from "./core-types";

// Property keys the engine handles while no ref-doc catalog declares them. Each
// key comes from the component's `GetProperty` / `SetProperty` branches in the
// engine source, or from an upstream example that reads it, and cites that
// evidence. A key the engine reads but never writes is `readonly`.
declare global {
  namespace go {
    interface Properties {
      /** The position's x component. `gameobject.cpp:GetProperty` reads one float. */
      "position.x": number;
      /** The position's y component. `gameobject.cpp:GetProperty` reads one float. */
      "position.y": number;
      /** The position's z component. `gameobject.cpp:GetProperty` reads one float. */
      "position.z": number;
      /** The rotation quaternion's x component. `gameobject.cpp:GetProperty` reads one float. */
      "rotation.x": number;
      /** The rotation quaternion's y component. `gameobject.cpp:GetProperty` reads one float. */
      "rotation.y": number;
      /** The rotation quaternion's z component. `gameobject.cpp:GetProperty` reads one float. */
      "rotation.z": number;
      /** The rotation quaternion's w component. `gameobject.cpp:GetProperty` reads one float. */
      "rotation.w": number;
      /** The euler rotation's x angle, in degrees. `gameobject.cpp:GetProperty` reads one float. */
      "euler.x": number;
      /** The euler rotation's y angle, in degrees. `gameobject.cpp:GetProperty` reads one float. */
      "euler.y": number;
      /** The euler rotation's z angle, in degrees. `gameobject.cpp:GetProperty` reads one float. */
      "euler.z": number;
      /** The scale's x component. `gameobject.cpp:GetProperty` reads one float. */
      "scale.x": number;
      /** The scale's y component. `gameobject.cpp:GetProperty` reads one float. */
      "scale.y": number;
      /** The scale's z component. `gameobject.cpp:GetProperty` reads one float. */
      "scale.z": number;
      /**
       * The scale's x and y components. `gameobject.cpp:GetProperty` reads a
       * vector3 whose z is always 1. `go.set` also takes a number, which it
       * applies to both x and y.
       */
      "scale.xy": Vector3;
    }
  }

  namespace label {
    interface Properties {
      /** The scale's x component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "scale.x": number;
      /** The scale's y component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "scale.y": number;
      /** The scale's z component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "scale.z": number;
      /**
       * The scale's x and y components. `comp_label.cpp` reads it through
       * `comp_private.cpp:GetProperty`, which returns the whole vector3. `go.set`
       * also takes a number, which it applies to both x and y, as `go`'s
       * `"scale.xy"` does.
       */
      "scale.xy": Vector3;
      /** The size's x component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "size.x": number;
      /** The size's y component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "size.y": number;
      /** The size's z component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "size.z": number;
      /**
       * The size's x and y components. `comp_label.cpp` reads it through
       * `comp_private.cpp:GetProperty`, which returns the whole vector3. `go.set`
       * also takes a number, which it applies to both x and y, as `go`'s
       * `"scale.xy"` does.
       */
      "size.xy": Vector3;
      /** The color's x component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "color.x": number;
      /** The color's y component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "color.y": number;
      /** The color's z component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "color.z": number;
      /** The color's w component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "color.w": number;
      /** The outline color's x component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "outline.x": number;
      /** The outline color's y component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "outline.y": number;
      /** The outline color's z component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "outline.z": number;
      /** The outline color's w component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "outline.w": number;
      /** The shadow color's x component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "shadow.x": number;
      /** The shadow color's y component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "shadow.y": number;
      /** The shadow color's z component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "shadow.z": number;
      /** The shadow color's w component. `comp_label.cpp` and `comp_private.cpp` read and write one float. */
      "shadow.w": number;
    }
  }

  namespace sprite {
    interface Properties {
      /** The scale's x component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "scale.x": number;
      /** The scale's y component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "scale.y": number;
      /** The scale's z component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "scale.z": number;
      /**
       * The scale's x and y components. `comp_sprite.cpp` reads it through
       * `comp_private.cpp:GetProperty`, which returns the whole vector3. `go.set`
       * also takes a number, which it applies to both x and y, as `go`'s
       * `"scale.xy"` does.
       */
      "scale.xy": Vector3;
      /** The size's x component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "size.x": number;
      /** The size's y component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "size.y": number;
      /** The size's z component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "size.z": number;
      /**
       * The size's x and y components. `comp_sprite.cpp` reads it through
       * `comp_private.cpp:GetProperty`, which returns the whole vector3. `go.set`
       * also takes a number, which it applies to both x and y, as `go`'s
       * `"scale.xy"` does.
       */
      "size.xy": Vector3;
      /** The slice-9 border's x component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "slice.x": number;
      /** The slice-9 border's y component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "slice.y": number;
      /** The slice-9 border's z component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "slice.z": number;
      /** The slice-9 border's w component. `comp_sprite.cpp` and `comp_private.cpp` read and write one float. */
      "slice.w": number;
      /**
       * The texture bound to the sprite's first sampler. Not in the sprite
       * ref-doc; `resource.set`'s example reads it with
       * `go.get("#sprite", "texture0")`. Read-only:
       * `comp_sprite.cpp:CompSpriteSetProperty` has no branch for it.
       */
      readonly texture0: Hash;
    }
  }

  namespace model {
    interface Properties {
      /**
       * The material resource the model renders with.
       * `comp_model.cpp:CompModelGetProperty` and `CompModelSetProperty` read
       * and write it as a resource path hash.
       */
      material: Hash;
      /**
       * The skin the model's rig uses. `comp_model.cpp:CompModelGetProperty` and
       * `CompModelSetProperty` read and write it as a hash.
       */
      skin: Hash;
    }
  }

  namespace physics {
    interface Properties {
      /**
       * Whether the body runs continuous collision detection as a fast-moving
       * bullet. Box2D only: `comp_collision_object_box2d.cpp` reads and writes
       * it, while Bullet3D logs a warning and reports the property as not found.
       */
      bullet: boolean;
    }
  }

  namespace factory {
    /**
     * Factory component properties. Upstream's factory reference declares none.
     */
    interface Properties {
      /**
       * The path hash of the prototype the factory spawns. Read-only:
       * `comp_factory.cpp:CompFactoryGetProperty` reads it and the component
       * registers no set handler.
       */
      readonly prototype: Hash;
    }
  }

  namespace collectionfactory {
    /**
     * Collection factory component properties. Upstream's collectionfactory
     * reference declares none.
     */
    interface Properties {
      /**
       * The path hash of the collection prototype the factory spawns.
       * Read-only: `comp_collection_factory.cpp:CompCollectionFactoryGetProperty`
       * reads it and the component registers no set handler.
       */
      readonly prototype: Hash;
    }
  }

  /**
   * Mesh component properties. Upstream ships no mesh API module, so this
   * catalog holds the keys `comp_mesh.cpp:CompMeshGetProperty` and
   * `CompMeshSetProperty` handle.
   */
  namespace mesh {
    interface Properties {
      /**
       * The buffer resource holding the mesh's vertex data.
       * `resource.get_buffer` and `resource.set_buffer` read it with
       * `go.get("#mesh", "vertices")`.
       */
      vertices: Hash;
      /** The material resource the mesh renders with, as a resource path hash. */
      material: Hash;
      /** The texture on unit 0, as a resource path hash. The engine holds units 0-15. */
      texture0: Hash;
      /** The texture on unit 1, as a resource path hash. */
      texture1: Hash;
      /** The texture on unit 2, as a resource path hash. */
      texture2: Hash;
      /** The texture on unit 3, as a resource path hash. */
      texture3: Hash;
      /** The texture on unit 4, as a resource path hash. */
      texture4: Hash;
      /** The texture on unit 5, as a resource path hash. */
      texture5: Hash;
      /** The texture on unit 6, as a resource path hash. */
      texture6: Hash;
      /** The texture on unit 7, as a resource path hash. */
      texture7: Hash;
      /** The texture on unit 8, as a resource path hash. */
      texture8: Hash;
      /** The texture on unit 9, as a resource path hash. */
      texture9: Hash;
      /** The texture on unit 10, as a resource path hash. */
      texture10: Hash;
      /** The texture on unit 11, as a resource path hash. */
      texture11: Hash;
      /** The texture on unit 12, as a resource path hash. */
      texture12: Hash;
      /** The texture on unit 13, as a resource path hash. */
      texture13: Hash;
      /** The texture on unit 14, as a resource path hash. */
      texture14: Hash;
      /** The texture on unit 15, as a resource path hash. */
      texture15: Hash;
    }
  }
}
