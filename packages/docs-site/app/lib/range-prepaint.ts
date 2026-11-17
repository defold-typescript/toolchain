import {
  API_SURFACE_STORAGE_KEY,
  type ApiSurfaceConfig,
  chooseRangeOption,
  readStoredRange,
  resolveApiSurfaceRedirect,
} from "./api-surface-pref";
import { applySinceFilter } from "./since-filter";

/**
 * The inline `<head>` script that applies the reader's stored API window before
 * first paint, built from the tested functions by `toString()`:
 *
 *   1. redirect an un-prefixed API page onto the stored window;
 *   2. record the window a range picker option chooses, from a document-level
 *      click listener, and go where `chooseRangeOption` says when the option's
 *      href does not lead there;
 *   3. expose the window on `<html>` as `data-api-range="<from>|<to>"`;
 *   4. once the body is parsed, hide the symbols the stored `from` excludes,
 *      inside `[data-page-body]` only.
 *
 * It never touches markup React hydrates: the page body is HTML React inserts
 * and does not reconcile, and the sidebar follows the stored window as React
 * state. The listener is what lets a click before hydration, on an option still
 * carrying the server's href, keep the reader's other bound. The server renders
 * every page at `from` = oldest, so a window starting there has nothing to hide
 * and the body is left as served.
 */
export function rangePrepaintScript(config: ApiSurfaceConfig): string {
  const key = JSON.stringify(API_SURFACE_STORAGE_KEY);
  // The sidebar pills read the badge table in React, and the page body holds
  // none, so the inline copy leaves it out.
  const json = JSON.stringify({ ...config, badgeCounts: {} }).replace(/</g, "\\u003c");
  return `(function(){var K=${key},C=${json};var readRange=${readStoredRange.toString()};var redirect=${resolveApiSurfaceRedirect.toString()};var filter=${applySinceFilter.toString()};var choose=${chooseRangeOption.toString()};var stored=null;try{stored=localStorage.getItem(K);}catch(_){}try{var t=redirect(location.pathname,location.search,stored,C,readRange);if(t&&t!==location.pathname+location.search){location.replace(t);return;}}catch(_){}try{document.addEventListener('click',function(e){var el=e.target;while(el&&el.getAttribute){var v=el.getAttribute('data-range-option'),b=el.getAttribute('data-range-bound');if(v!=null&&b!=null){var s=null;try{s=localStorage.getItem(K);}catch(_){}var c=choose(location.pathname,location.search,s,b,v,C,readRange,redirect);try{localStorage.setItem(K,c.stored);}catch(_){}if(c.target&&c.target!==el.getAttribute('href')&&!e.defaultPrevented&&e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();location.assign(c.target);}return;}el=el.parentNode;}},true);}catch(_){}var range;try{range=readRange(location.pathname,location.search,stored,C);}catch(_){return;}document.documentElement.setAttribute('data-api-range',range.from+'|'+range.to);if(range.from===C.versionIds[C.versionIds.length-1])return;var apply=function(){var body=document.querySelector('[data-page-body]');if(!body)return;try{filter(body,range,C);}catch(_){}};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',apply);}else{apply();}})();`;
}
