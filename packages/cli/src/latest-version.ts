export const LATEST_CLI_VERSION_URL = "https://registry.npmjs.org/@defold-typescript/cli/latest";

export type FetchImpl = (url: string) => Promise<Response>;

// `upgrade` is the one verb allowed online (init/build/watch stay offline and
// deterministic), so a registry failure is fatal and loud: never fall back to a
// version, which would turn an upgrade into a silent no-op re-scaffold.
export async function resolveLatestCliVersion(
  fetchImpl: FetchImpl = (url) => fetch(url),
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl(LATEST_CLI_VERSION_URL);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `defold-typescript upgrade: could not reach the npm registry (${LATEST_CLI_VERSION_URL}); upgrading needs a network connection. (${detail})`,
    );
  }
  if (!res.ok) {
    throw new Error(
      `defold-typescript upgrade: could not resolve the latest CLI version (${LATEST_CLI_VERSION_URL} -> ${res.status} ${res.statusText}).`,
    );
  }
  const body = (await res.json()) as { version?: unknown };
  if (typeof body.version !== "string" || body.version.length === 0) {
    throw new Error(`defold-typescript upgrade: ${LATEST_CLI_VERSION_URL} returned no version.`);
  }
  return body.version;
}
