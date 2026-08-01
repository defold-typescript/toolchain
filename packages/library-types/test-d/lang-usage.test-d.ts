/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as lang from "lang.lang";

// Compile-only proof (mirroring event-usage.test-d.ts) that the lang LuaLS golden
// accepts faithful upstream calls: `init` with only the required `available_langs`
// (its trailing type-suffix `lang_on_start?` omitted) over a `lang_data[]` whose
// omittable `path`/`loader` fields may be dropped, `set_lang` with only the
// required id, and `set_next_lang` with no args. No assertions execute;
// `tsc --noEmit` under tsconfig.dts-check.json (skipLibCheck: false) is the gate.
// A regression (the type-suffix params reverting to required, or the nilable
// fields losing their `?`) is a compile error here.

lang.init([{ id: "en", path: "/locales/en.json" }]);
lang.set_lang("en");
lang.set_next_lang();

// `set_lang`'s trailing `function?` param lowers to an optional callable, so a
// plain literal is accepted where the type used to be `unknown | undefined`.
lang.set_lang("en", () => {});
