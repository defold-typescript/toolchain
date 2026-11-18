import type { ReactNode } from "react";
import { faviconLinks } from "./favicon";
import { THEME_TOKENS } from "./theme-tokens";

function underBase(basePath: string, path: string): string {
  return `${basePath.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

/**
 * The `<head>` both docs sites render. `basePath` is the deploy subpath
 * (`/toolchain/` on GitHub Pages, `/` at a domain root); each asset link resolves
 * under it. `fontPreloads` are the built font URLs, which already carry the base.
 * `children` render after the theme tokens and before the stylesheet.
 */
export function DocumentHead({
  basePath,
  fontPreloads,
  children,
}: {
  basePath: string;
  fontPreloads: readonly string[];
  children?: ReactNode;
}) {
  return (
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      {/* A font preload is reused only when its mode and type match the
          stylesheet's own fetch, which is always CORS. */}
      {fontPreloads.map((href) => (
        <link key={href} rel="preload" as="font" type="font/woff2" crossOrigin="" href={href} />
      ))}
      {/* The shared renderer's type scale and color tokens, then its unlayered
          rules, which win over the layered typography for the markup it
          writes (signatures, heading anchors). */}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant from the repo */}
      <style dangerouslySetInnerHTML={{ __html: THEME_TOKENS }} />
      {children}
      <link rel="stylesheet" href={underBase(basePath, "critical.css")} />
      {faviconLinks().map((link) => (
        <link
          key={link.rel + link.href}
          rel={link.rel}
          type={link.type}
          sizes={link.sizes}
          href={underBase(basePath, link.href)}
        />
      ))}
    </head>
  );
}
