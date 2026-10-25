/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof that a curated native namespace a release shipped as a
// global still compiles bare, deprecated, and that one no release shipped as a
// global needs its import. This file imports nothing, so every name below is
// global. `tsc --noEmit` under tsconfig.dts-check.json is the gate.

declare const bytes: string;

const _id: string = uuid4.generate();
share.text("hi");

// @ts-expect-error the deprecated global is a value; a type named through the namespace needs the import.
const _options: share.FileOptions = {};

// @ts-expect-error png never shipped as a global; import it.
png.info(bytes);
