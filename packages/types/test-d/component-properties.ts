/// <reference path="../index.d.ts" />
import type { Hash, Matrix4, Vector3 } from "../src/core-types";

// The camera catalog: every member is typed `float` upstream, so before the
// token was mapped all eight resolved to `unknown` and no annotated read
// compiled without a cast.
const _fov: number = go.get<camera.properties>()("#camera", "fov");
const _nearZ: number = go.get<camera.properties>()("#camera", "near_z");
const _aspect: number = go.get<camera.properties>()("#camera", "aspect_ratio");
void _fov;
void _nearZ;
void _aspect;

go.set<camera.properties>()("#camera", "fov", 0.7853);

// @ts-expect-error fov is number, not a Hash — value is gated to P[K]
go.set<camera.properties>()("#camera", "fov", hash("x"));

// Curated corrections. `camera.projection` and `camera.view` carry the same
// `float` span as their siblings while the prose beside them says `matrix4`,
// so the correction is what makes a Matrix4 read check.
const _projection: Matrix4 = go.get<camera.properties>()("#camera", "projection");
const _view: Matrix4 = go.get<camera.properties>()("#camera", "view");
void _projection;
void _view;

// `sprite.frame_count` is spanned `hash` upstream for a frame count; corrected,
// it reads as the number it is and arithmetic on it checks.
const _frames: number = go.get<sprite.properties>()("#sprite", "frame_count");
const _last: number = _frames - 1;
void _last;

// @ts-expect-error frame_count is corrected to number, so a Hash read no longer checks
const _framesAsHash: Hash = go.get<sprite.properties>()("#sprite", "frame_count");
void _framesAsHash;

// An uncorrected sibling in the same catalog keeps the type upstream declares.
const _image: Hash = go.get<sprite.properties>()("#sprite", "image");
void _image;

// `model.textureN` is upstream's placeholder for the eight texture slots, so the
// catalog keys the whole numbered family and rejects the placeholder itself.
const _modelTexture0: Hash = go.get<model.properties>()("#model", "texture0");
const _modelTexture7: Hash = go.get<model.properties>()("#model", "texture7");
void _modelTexture0;
void _modelTexture7;

// @ts-expect-error textureN is the placeholder, not a key the engine accepts
go.get<model.properties>()("#model", "textureN");
// @ts-expect-error the ref-doc bounds the units to 0-7
go.get<model.properties>()("#model", "texture8");
// @ts-expect-error a unit is never negative
go.get<model.properties>()("#model", "texture-1");
// @ts-expect-error a unit is never fractional
go.get<model.properties>()("#model", "texture1.5");

// Hand-written keys the ref-docs omit but upstream examples read.
const _spriteTexture: Hash = go.get<sprite.properties>()("#sprite", "texture0");
void _spriteTexture;

const _meshVertices: Hash = go.get<mesh.properties>()("#mesh", "vertices");
void _meshVertices;

// @ts-expect-error the mesh catalog declares only the evidenced key
go.get<mesh.properties>()("#mesh", "indices");

// Keys the engine reads but has no write branch for: the typed write refuses
// them, while the read still checks.
const _modelAnimation: Hash = go.get<model.properties>()("#model", "animation");
void _modelAnimation;
// @ts-expect-error comp_model.cpp has no set branch for animation
go.set<model.properties>()("#model", "animation", hash("run"));

// @ts-expect-error comp_sprite.cpp has no set branch for texture0
go.set<sprite.properties>()("#sprite", "texture0", hash("t"));

// Keys the component source reads and writes while no ref-doc catalog declares them.
const _modelMaterial: Hash = go.get<model.properties>()("#model", "material");
const _modelSkin: Hash = go.get<model.properties>()("#model", "skin");
void _modelMaterial;
void _modelSkin;
go.set<model.properties>()("#model", "material", hash("/main/m.materialc"));
go.set<model.properties>()("#model", "skin", hash("armor"));

const _bullet: boolean = go.get<physics.properties>()("#collisionobject", "bullet");
void _bullet;
go.set<physics.properties>()("#collisionobject", "bullet", true);

const _meshMaterial: Hash = go.get<mesh.properties>()("#mesh", "material");
const _meshTexture3: Hash = go.get<mesh.properties>()("#mesh", "texture3");
const _meshTexture15: Hash = go.get<mesh.properties>()("#mesh", "texture15");
void _meshMaterial;
void _meshTexture3;
void _meshTexture15;
go.set<mesh.properties>()("#mesh", "texture3", hash("/main/t.texturec"));
// @ts-expect-error the engine holds sixteen texture units, 0-15
go.get<mesh.properties>()("#mesh", "texture16");

// A factory's prototype is read-only: neither factory component has a set branch.
const _prototype: Hash = go.get<factory.properties>()("#factory", "prototype");
const _collectionPrototype: Hash = go.get<collectionfactory.properties>()(
  "#collectionfactory",
  "prototype",
);
void _prototype;
void _collectionPrototype;
// @ts-expect-error comp_factory.cpp registers no set handler
go.set<factory.properties>()("#factory", "prototype", hash("/main/p.goc"));
// @ts-expect-error comp_collection_factory.cpp registers no set handler
go.set<collectionfactory.properties>()("#cf", "prototype", hash("/main/p.collectionc"));

// Transform sub-element keys read through the `go.properties` overload at the
// kind the engine returns: one float per component, a vector3 for `scale.xy`.
const _positionX: number = go.get(".", "position.x");
const _positionY: number = go.get(".", "position.y");
const _positionZ: number = go.get(".", "position.z");
const _rotationX: number = go.get(".", "rotation.x");
const _rotationY: number = go.get(".", "rotation.y");
const _rotationZ: number = go.get(".", "rotation.z");
const _rotationW: number = go.get(".", "rotation.w");
const _eulerX: number = go.get(".", "euler.x");
const _eulerY: number = go.get(".", "euler.y");
const _eulerZ: number = go.get(".", "euler.z");
const _scaleX: number = go.get(".", "scale.x");
const _scaleY: number = go.get(".", "scale.y");
const _scaleZ: number = go.get(".", "scale.z");
const _scaleXY: Vector3 = go.get(".", "scale.xy");
void [_positionX, _positionY, _positionZ, _rotationX, _rotationY, _rotationZ, _rotationW];
void [_eulerX, _eulerY, _eulerZ, _scaleX, _scaleY, _scaleZ, _scaleXY];
