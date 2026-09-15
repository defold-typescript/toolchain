/// <reference path="../index.d.ts" />

// The prose-only "table (array) of id(s)" slot is an array shape the field
// parser cannot read; its element token(s) are hand-curated in
// HOMOGENEOUS_ARRAY_SLOTS and emitted as a plain array. go.delete's is the id
// union `string | hash | url`, emitted `(string | Hash | Url)[]`. The extension
// slot curated the same way (iap.list) is proven in extensions/id-array-slots.ts.

// go.delete accepts a Hash[] — a hash is one member of the id union (group ids
// returned by sound.get_groups are Hash, the engine's id type).
const ids = sound.get_groups();
go.delete(ids);

// The scalar id form still type-checks (the union's non-array members).
go.delete(ids[0]);

// @ts-expect-error go.delete's array element is an id union, not a number.
go.delete([1, 2]);
