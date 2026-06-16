export interface SidebarGeometry {
  targetTop: number;
  targetHeight: number;
  viewTop: number;
  viewHeight: number;
  maxScroll: number;
}

export function sidebarScrollTop(g: SidebarGeometry): number {
  const { targetTop, targetHeight, viewTop, viewHeight, maxScroll } = g;
  if (targetTop >= viewTop && targetTop + targetHeight <= viewTop + viewHeight) {
    return viewTop;
  }
  const centered = targetTop - viewHeight / 2 + targetHeight / 2;
  return Math.max(0, Math.min(centered, maxScroll));
}
