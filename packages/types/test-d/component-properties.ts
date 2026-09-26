/// <reference path="../index.d.ts" />
import type { Hash, Matrix4 } from "../src/core-types";

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

// Hand-written keys the ref-docs omit but upstream examples read.
const _spriteTexture: Hash = go.get<sprite.properties>()("#sprite", "texture0");
void _spriteTexture;

const _meshVertices: Hash = go.get<mesh.properties>()("#mesh", "vertices");
void _meshVertices;

// @ts-expect-error the mesh catalog declares only the evidenced key
go.get<mesh.properties>()("#mesh", "indices");
