export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

// The runner (`bunx`/`npx`/`pnpm dlx`/`yarn dlx`) sets `npm_config_user_agent`
// with the manager as its first token; when the bin is run directly the var is
// unset. A wrong guess only mis-advises — it never writes a lockfile — so the
// fallback to bun (the repo's primary manager) is safe.
export function packageManager(env: NodeJS.ProcessEnv = process.env): PackageManager {
  const manager = (env.npm_config_user_agent ?? "").split("/")[0];
  if (manager === "pnpm" || manager === "yarn" || manager === "npm") {
    return manager;
  }
  return "bun";
}

export function installHint(env: NodeJS.ProcessEnv = process.env): string {
  return `${packageManager(env)} install`;
}
