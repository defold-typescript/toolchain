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
  /** First `# ` H1 of the body; feeds the `/guides` landing card title. */
  title?: string;
  /** One-line summary drawn from the body's lead paragraph, for landing cards. */
  summary?: string;
  /** Inline this page's body into llms-full.txt; `false` when frontmatter has `llms-full: false`. */
  includeInLlmsFull: boolean;
  /**
   * `agent-entry` frontmatter priority for the package llms.txt "Key docs for
   * agents" list. Lower = higher priority; unset omits the page from that
   * curated list (it still appears in the full `## Guide` dump).
   */
  agentEntry?: number;
}
