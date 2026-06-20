export interface GuidePage {
  /** Source filename, e.g. `getting-started.md`. */
  file: string;
  /** Route slug derived from the filename; empty for the index page. */
  slug: string;
  /** URL route, e.g. `/getting-started`; `/` for the index page. */
  route: string;
  /** True for `README.md`, which maps to the site index. */
  isIndex: boolean;
  /** Left-sidebar label override from the file's `toc-title` frontmatter. */
  tocTitle?: string;
}
