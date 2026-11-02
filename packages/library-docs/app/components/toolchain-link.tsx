/** @jsxImportSource hono/jsx */
// Pins the JSX dialect for root `bun test`, which reads no JSX config from the root tsconfig.
import { EXTERNAL_LINK_ICON } from "../lib/phosphor";
import { TOOLCHAIN_DOCS_URL } from "../lib/toolchain-links";

export function ToolchainLink() {
  return (
    <a
      href={TOOLCHAIN_DOCS_URL}
      target="_blank"
      rel="noreferrer"
      class="inline-flex items-center whitespace-nowrap px-3 text-[length:var(--nav-top-size)] text-text-muted transition hover:text-text"
    >
      Toolchain docs
      <span dangerouslySetInnerHTML={{ __html: EXTERNAL_LINK_ICON }} />
    </a>
  );
}
