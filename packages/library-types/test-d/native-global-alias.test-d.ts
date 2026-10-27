/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof that no curated native namespace is a global: each one,
// including those v0.53.0 shipped as globals, needs its import. This file
// imports nothing, so every name below is global. `tsc --noEmit` under
// tsconfig.dts-check.json is the gate.

declare const bytes: string;

// @ts-expect-error the deprecated uuid4 global is gone; import it.
uuid4.generate();

// @ts-expect-error the share global is gone; import it.
share.text("hi");

// @ts-expect-error a type named through the namespace needs the import.
const _options: share.FileOptions = {};

// @ts-expect-error png never shipped as a global; import it.
png.info(bytes);
