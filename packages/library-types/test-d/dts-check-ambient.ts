/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Loads the ambient globals (`Vector3`, `Hash`, `Url`, `Opaque`, `LuaTable`,
// `LuaMultiReturn`) that the generated `.d.ts` surfaces reference, so the
// `skipLibCheck: false` declaration-validity check resolves them instead of
// erroring on missing names. It exercises no API — the reference directives are
// the whole point.

export {};
