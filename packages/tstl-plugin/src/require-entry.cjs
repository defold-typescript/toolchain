// tsserver resolves a plugin with Node10 resolution — `exports` is not
// consulted — and then rejects the loaded value unless it is itself a function.
// `require()` of the ESM entry yields the namespace object instead, so this
// CommonJS shim is what `main` points at: it unwraps the factory, and the ESM
// bundle stays the single build of the plugin.
module.exports = require("./index.js").default;
