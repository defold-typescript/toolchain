#!/usr/bin/env node
import { loadPropertyEvaluator } from "@defold-typescript/transpiler";
import { dispatch } from "./dispatch";

await loadPropertyEvaluator();
const code = await dispatch(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
});
process.exit(code);
