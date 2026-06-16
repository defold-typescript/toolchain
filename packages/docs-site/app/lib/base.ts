// The site can be served from a subpath (GitHub Pages project sites live at
// `/<repo>/`). Vite's `base` becomes `import.meta.env.BASE_URL` (always
// trailing-slashed, e.g. `/toolchain/`, or `/` at the domain root). Internal
// routes and asset references are authored root-absolute (`/api`, `/static/x`)
// so route matching, data, and tests stay base-agnostic; `withBase` is applied
// only where a value is emitted as a real URL into HTML or a fetch.
//
// `__DOCS_BASE__` is replaced at build time by Vite's `define` (see
// vite.config.ts) in BOTH the client and the honox server bundles — unlike
// `import.meta.env.BASE_URL`, which the server bundle leaves empty. Outside Vite
// (the Bun test runner) the token is undefined, so `typeof` keeps it safe and
// the base resolves to `/`: every `withBase` call is then an identity on an
// already root-absolute path.
declare const __DOCS_BASE__: string;
const BASE = (typeof __DOCS_BASE__ !== "undefined" ? __DOCS_BASE__ : "/").replace(/\/$/, "");

export function withBase(path: string): string {
  const rel = path.startsWith("/") ? path : `/${path}`;
  return `${BASE}${rel}`;
}
