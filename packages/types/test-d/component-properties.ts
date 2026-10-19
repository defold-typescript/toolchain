/// <reference path="../index.d.ts" />
import type { Hash, Matrix4, Vector3 } from "../src/core-types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// @ts-expect-error the component properties interface is spelled `model.Properties`
declare const _p: model.properties;
void _p;

// The camera catalog: every member is typed `float` upstream, so before the
// token was mapped all eight resolved to `unknown` and no annotated read
// compiled without a cast.
const _fov: number = go.get<camera.Properties>()("#camera", "fov");
const _nearZ: number = go.get<camera.Properties>()("#camera", "near_z");
const _aspect: number = go.get<camera.Properties>()("#camera", "aspect_ratio");
void _fov;
void _nearZ;
void _aspect;

go.set<camera.Properties>()("#camera", "fov", 0.7853);

// @ts-expect-error fov is number, not a Hash — value is gated to P[K]
go.set<camera.Properties>()("#camera", "fov", hash("x"));

// Curated corrections. `camera.projection` and `camera.view` carry the same
// `float` span as their siblings while the prose beside them says `matrix4`,
// so the correction is what makes a Matrix4 read check.
const _projection: Matrix4 = go.get<camera.Properties>()("#camera", "projection");
const _view: Matrix4 = go.get<camera.Properties>()("#camera", "view");
void _projection;
void _view;

// `sprite.frame_count` is spanned `hash` upstream for a frame count; corrected,
// it reads as the number it is and arithmetic on it checks.
const _frames: number = go.get<sprite.Properties>()("#sprite", "frame_count");
const _last: number = _frames - 1;
void _last;

// @ts-expect-error frame_count is corrected to number, so a Hash read no longer checks
const _framesAsHash: Hash = go.get<sprite.Properties>()("#sprite", "frame_count");
void _framesAsHash;

// An uncorrected sibling in the same catalog keeps the type upstream declares.
const _image: Hash = go.get<sprite.Properties>()("#sprite", "image");
void _image;

// `model.textureN` is upstream's placeholder for the numbered texture units, so
// the catalog keys the whole family and rejects the placeholder itself. The
// ref-doc says 0-7; comp_model.cpp matches units below
// dmRender::RenderObject::MAX_TEXTURE_COUNT (16), and the vendored engine
// source decides the sixteen keys here.
type ModelTextureKey =
  `texture${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`;
const _modelTextures: Equal<
  Pick<model.Properties, ModelTextureKey>,
  Record<ModelTextureKey, Hash>
> = true;
void _modelTextures;
const _modelTextureKey = null as unknown as ModelTextureKey;
go.set<model.Properties>()("#model", _modelTextureKey, hash("/main/t.texturec"));

// @ts-expect-error textureN is the placeholder, not a key the engine accepts
go.get<model.Properties>()("#model", "textureN");
// @ts-expect-error the engine holds sixteen texture units, 0-15
go.get<model.Properties>()("#model", "texture16");
// @ts-expect-error a unit is never negative
go.get<model.Properties>()("#model", "texture-1");
// @ts-expect-error a unit is never fractional
go.get<model.Properties>()("#model", "texture1.5");

// Hand-written keys the ref-docs omit but upstream examples read.
const _spriteTexture: Hash = go.get<sprite.Properties>()("#sprite", "texture0");
void _spriteTexture;

const _meshVertices: Hash = go.get<mesh.Properties>()("#mesh", "vertices");
void _meshVertices;

// @ts-expect-error the mesh catalog declares only the evidenced key
go.get<mesh.Properties>()("#mesh", "indices");

// Keys the engine reads but has no write branch for: the typed write refuses
// them, while the read still checks.
const _modelAnimation: Hash = go.get<model.Properties>()("#model", "animation");
void _modelAnimation;
// @ts-expect-error comp_model.cpp has no set branch for animation
go.set<model.Properties>()("#model", "animation", hash("run"));

// @ts-expect-error comp_sprite.cpp has no set branch for texture0
go.set<sprite.Properties>()("#sprite", "texture0", hash("t"));

// Keys the component source reads and writes while no ref-doc catalog declares them.
const _modelMaterial: Hash = go.get<model.Properties>()("#model", "material");
const _modelSkin: Hash = go.get<model.Properties>()("#model", "skin");
void _modelMaterial;
void _modelSkin;
go.set<model.Properties>()("#model", "material", hash("/main/m.materialc"));
go.set<model.Properties>()("#model", "skin", hash("armor"));

const _bullet: boolean = go.get<physics.Properties>()("#collisionobject", "bullet");
void _bullet;
go.set<physics.Properties>()("#collisionobject", "bullet", true);

const _meshMaterial: Hash = go.get<mesh.Properties>()("#mesh", "material");
void _meshMaterial;

// comp_mesh.cpp binds texture units below dmRender::RenderObject::MAX_TEXTURE_COUNT (16).
type MeshTextureKey =
  `texture${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15}`;
const _meshTextures: Equal<
  Pick<mesh.Properties, MeshTextureKey>,
  Record<MeshTextureKey, Hash>
> = true;
void _meshTextures;
const _meshTextureKey = null as unknown as MeshTextureKey;
go.set<mesh.Properties>()("#mesh", _meshTextureKey, hash("/main/t.texturec"));
// @ts-expect-error the engine holds sixteen texture units, 0-15
go.get<mesh.Properties>()("#mesh", "texture16");

// A factory's prototype is read-only: neither factory component has a set branch.
const _prototype: Hash = go.get<factory.Properties>()("#factory", "prototype");
const _collectionPrototype: Hash = go.get<collectionfactory.Properties>()(
  "#collectionfactory",
  "prototype",
);
void _prototype;
void _collectionPrototype;
// @ts-expect-error comp_factory.cpp registers no set handler
go.set<factory.Properties>()("#factory", "prototype", hash("/main/p.goc"));
// @ts-expect-error comp_collection_factory.cpp registers no set handler
go.set<collectionfactory.Properties>()("#cf", "prototype", hash("/main/p.collectionc"));

// Transform sub-element keys read through the `go.Properties` overload at the
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

// Label and sprite vector properties take the sub-keys `DM_GAMESYS_PROP_VECTOR3`
// and `DM_GAMESYS_PROP_VECTOR4` register: one float per component, and a
// vector3 for `.xy` on a vector3 property.
const _labelColorW: number = go.get<label.Properties>()("#label", "color.w");
const _labelScaleXY: Vector3 = go.get<label.Properties>()("#label", "scale.xy");
go.set<label.Properties>()("#label", "outline.x", 0.5);
const _spriteSliceW: number = go.get<sprite.Properties>()("#sprite", "slice.w");
const _spriteSizeXY: Vector3 = go.get<sprite.Properties>()("#sprite", "size.xy");
void [_labelColorW, _labelScaleXY, _spriteSliceW, _spriteSizeXY];

// @ts-expect-error a vector3 property registers no `.w`
go.get<label.Properties>()("#label", "scale.w");
// @ts-expect-error a vector4 property registers no `.xy`
go.get<sprite.Properties>()("#sprite", "slice.xy");
