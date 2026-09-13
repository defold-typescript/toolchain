// Imported by repo-root scripts through `nav.ts`, whose tsconfig lacks the docs
// site's `vite-env.d.ts`, so the `?raw` module declaration is referenced here.
/// <reference types="vite/client" />
import glyphRaw from "@phosphor-icons/core/duotone/subtitles-slash-duotone.svg?raw";
import type { LibraryApiKind } from "./nav";

export const NO_TYPED_API_LABEL = "No typed API";

// What an untyped library's page and index card say about its Lua surface, as
// markdown: the page renders the code spans, the card strips the backticks.
export const LIBRARY_API_KIND_SENTENCE: Record<LibraryApiKind, string> = {
  none: "No Lua API — content, shaders, build-time tooling or engine-side native code only.",
  untyped: "Lua API not typed — upstream ships no `.script_api`, so `resolve` skips it.",
};

// The glyph marking a library that has a page but no typed API. The sidebar leaf,
// the Libraries index card and the listing page heading all inline this one
// string, so the three sites cannot drift apart in markup or accessible name.
export const NO_TYPED_API_ICON = glyphRaw
  .trim()
  .replace("<svg ", `<svg class="no-api-icon" role="img" aria-label="${NO_TYPED_API_LABEL}" `);
