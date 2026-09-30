import type { ModuleManifestEntry } from "./regen";

// A method the engine shares across several handle classes where a release's
// ref-doc documents it on only some of them. The handles it omits are restored
// from the documented one, so a doc omission never drops a method the engine
// still binds. Applies only where the source handle documents it.
export interface SharedHandleMethod {
  readonly namespace: string;
  readonly method: string;
  readonly source: string;
  readonly handles: readonly string[];
  readonly evidence: string;
}

const TCP_ANY =
  'LuaSocket tcp.c binds it in the one method table every tcp class shares, and checks its argument with auxiliar_checkgroup(L, "tcp{any}", 1)';

export const SHARED_HANDLE_METHODS: readonly SharedHandleMethod[] = (
  ["getstats", "setstats"] as const
).map((method) => ({
  namespace: "socket",
  method,
  source: "client",
  handles: ["master", "server"],
  evidence: TCP_ANY,
}));

interface DocElement {
  readonly name: string;
}

export function restoreSharedHandleMethods(
  modules: readonly ModuleManifestEntry[],
): ModuleManifestEntry[] {
  return modules.map((entry) => {
    const shared = SHARED_HANDLE_METHODS.filter((row) => row.namespace === entry.namespace);
    if (shared.length === 0) return entry;
    const doc = entry.doc as { elements: DocElement[] };
    const declared = new Set(doc.elements.map((element) => element.name));
    const restored: DocElement[] = [];
    for (const { method, source, handles } of shared) {
      const documented = doc.elements.find((element) => element.name === `${source}:${method}`);
      if (documented === undefined) continue;
      for (const handle of handles) {
        const name = `${handle}:${method}`;
        if (!declared.has(name)) restored.push({ ...documented, name });
      }
    }
    return restored.length === 0
      ? entry
      : { ...entry, doc: { ...doc, elements: [...doc.elements, ...restored] } };
  });
}
