export type FaviconLink = { rel: string; href: string; type?: string; sizes?: string };

export function faviconLinks(): FaviconLink[] {
  return [
    { rel: "icon", type: "image/svg+xml", href: "/logo-ver-classic.svg" },
    { rel: "icon", type: "image/png", sizes: "256x256", href: "/logo-ver-classic.png" },
    { rel: "apple-touch-icon", href: "/logo-ver-classic.png" },
  ];
}
