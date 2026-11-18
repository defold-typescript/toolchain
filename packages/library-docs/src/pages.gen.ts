// deno-fmt-ignore-file
// biome-ignore-all format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';

// prettier-ignore
import type { getConfig as File_ApiHostOwnerRepoNamespace_getConfig } from './pages/api/[host]/[owner]/[repo]/[namespace]';
// prettier-ignore
import type { getConfig as File_GuidesSlug_getConfig } from './pages/guides/[slug]';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_LibrariesHostOwnerRepo_getConfig } from './pages/libraries/[host]/[owner]/[repo]';
// prettier-ignore
import type { getConfig as File_Search_getConfig } from './pages/search';
// prettier-ignore
import type { getConfig as File_Layout_getConfig } from './pages/_layout';

// prettier-ignore
type Page =
| ({ path: '/api/[host]/[owner]/[repo]/[namespace]' } & GetConfigResponse<typeof File_ApiHostOwnerRepoNamespace_getConfig>)
| ({ path: '/guides/[slug]' } & GetConfigResponse<typeof File_GuidesSlug_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
| ({ path: '/libraries/[host]/[owner]/[repo]' } & GetConfigResponse<typeof File_LibrariesHostOwnerRepo_getConfig>)
| ({ path: '/search' } & GetConfigResponse<typeof File_Search_getConfig>);

// prettier-ignore
type Layout =
| ({ path: '/' } & Awaited<ReturnType<typeof File_Layout_getConfig>>);

// prettier-ignore
declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<Page>;
  }
  interface CreatePagesConfig {
    pages: Page;
    layouts: Layout;
  }
  interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}
}
