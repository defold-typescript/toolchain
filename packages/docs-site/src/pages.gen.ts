// deno-fmt-ignore-file
// biome-ignore-all format: generated types do not need formatting
// prettier-ignore
import type { PathsForPages, GetConfigResponse, SearchCodecsForPages } from 'waku/router';

// prettier-ignore
import type { getConfig as File_Slug_getConfig } from './pages/[slug]';
// prettier-ignore
import type { getConfig as File_ApiNamespace_getConfig } from './pages/api/[namespace]';
// prettier-ignore
import type { getConfig as File_ApiVersionNamespace_getConfig } from './pages/api/[version]/[namespace]';
// prettier-ignore
import type { getConfig as File_ApiCombinedNamespace_getConfig } from './pages/api/combined/[namespace]';
// prettier-ignore
import type { getConfig as File_ApiIndex_getConfig } from './pages/api/index';
// prettier-ignore
import type { getConfig as File_GetStarted_getConfig } from './pages/get-started';
// prettier-ignore
import type { getConfig as File_Guides_getConfig } from './pages/guides';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_Search_getConfig } from './pages/search';
// prettier-ignore
import type { getConfig as File_Layout_getConfig } from './pages/_layout';

// prettier-ignore
type Page =
| ({ path: '/[slug]' } & GetConfigResponse<typeof File_Slug_getConfig>)
| ({ path: '/api/[namespace]' } & GetConfigResponse<typeof File_ApiNamespace_getConfig>)
| ({ path: '/api/[version]/[namespace]' } & GetConfigResponse<typeof File_ApiVersionNamespace_getConfig>)
| ({ path: '/api/combined/[namespace]' } & GetConfigResponse<typeof File_ApiCombinedNamespace_getConfig>)
| ({ path: '/api' } & GetConfigResponse<typeof File_ApiIndex_getConfig>)
| ({ path: '/get-started' } & GetConfigResponse<typeof File_GetStarted_getConfig>)
| ({ path: '/guides' } & GetConfigResponse<typeof File_Guides_getConfig>)
| ({ path: '/' } & GetConfigResponse<typeof File_Index_getConfig>)
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
