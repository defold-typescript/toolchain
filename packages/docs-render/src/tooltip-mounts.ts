import { withBase } from "./base";
import { type SymbolEntry, symbolIndexFileForRoute } from "./symbol-index";
import { isSelfReference, normalizeSymbolKey } from "./symbol-self";
import { watchTapFocus } from "./tap-focus";
import { labelTooltipPosition, tooltipPosition } from "./tooltip-position";
import { TOOLTIP_TRIGGER_SLOT } from "./ui/tooltip-slot";

// Hover tooltips over server-rendered markup, as plain DOM so both docs sites
// call them: the HonoX islands from an effect, the Waku site from its page
// scripts. Each mount owns one floating element, which sits in `document.body`
// only while a tip shows, and returns a cleanup that removes every listener,
// class and node it added, so a page that remounts on navigation leaks nothing.

type Cleanup = () => void;

const UI_TIP_ID = "ui-tooltip";
const UI_TIP_CLASS =
  "pointer-events-none fixed z-50 w-max max-w-xs rounded-md bg-text px-3 py-1.5 text-xs text-bg shadow-lg";
const TRIGGER_SELECTOR = `[data-slot="${TOOLTIP_TRIGGER_SLOT}"]`;

/**
 * The single floating element behind every `TooltipTrigger`. Triggers are
 * server-rendered (often inside markdown), so the mount delegates from
 * `document` rather than binding each one, and so covers triggers anywhere on
 * the page without a rescan.
 *
 * Touch handling: hover shows tips for mouse pointers only, a focus raised by a
 * tap is ignored until the next keyboard input ends that suppression, and any
 * `pointerdown`, or a scroll that moves the trigger, dismisses the tip.
 *
 * The tip is measured once it holds its text, then placed with
 * `labelTooltipPosition`; it stays invisible until it is placed.
 */
export function mountUiTooltips(doc: Document): Cleanup {
  const view = doc.defaultView ?? window;
  const tip = doc.createElement("div");
  tip.id = UI_TIP_ID;
  tip.setAttribute("role", "tooltip");
  tip.dataset.slot = "tooltip-content";
  tip.className = UI_TIP_CLASS;

  let active: HTMLElement | null = null;
  const tapFocus = watchTapFocus(doc);

  const place = (trigger: HTMLElement) => {
    tip.textContent = trigger.dataset.tooltipContent ?? "";
    tip.style.top = "0px";
    tip.style.left = "0px";
    tip.style.visibility = "hidden";
    if (!tip.isConnected) doc.body.append(tip);
    const r = trigger.getBoundingClientRect();
    const size = tip.getBoundingClientRect();
    const { top, left } = labelTooltipPosition({
      rectLeft: r.left,
      rectTop: r.top,
      rectBottom: r.bottom,
      rectWidth: r.width,
      innerWidth: view.innerWidth,
      tipWidth: size.width,
      tipHeight: size.height,
    });
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.visibility = "visible";
  };

  // A trigger may change its label while its tip is shown: a button whose press flips what
  // the next press does. The tip then reads the new label, and is measured again.
  const relabelled = new view.MutationObserver(() => {
    if (active) place(active);
  });

  const hide = () => {
    if (!active) return;
    relabelled.disconnect();
    active.removeAttribute("aria-describedby");
    active = null;
    tip.remove();
  };

  const show = (trigger: HTMLElement) => {
    if (trigger === active) return;
    relabelled.disconnect();
    active?.removeAttribute("aria-describedby");
    active = trigger;
    trigger.setAttribute("aria-describedby", UI_TIP_ID);
    relabelled.observe(trigger, { attributeFilter: ["data-tooltip-content"] });
    place(trigger);
  };

  const triggerOf = (target: EventTarget | null) =>
    target instanceof view.Element ? target.closest<HTMLElement>(TRIGGER_SELECTOR) : null;

  const onPointerOver = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    const trigger = triggerOf(event.target);
    if (trigger) show(trigger);
  };
  const onPointerOut = (event: PointerEvent) => {
    if (!active || triggerOf(event.target) !== active) return;
    if (event.relatedTarget instanceof view.Node && active.contains(event.relatedTarget)) return;
    hide();
  };
  const onFocusIn = (event: FocusEvent) => {
    if (tapFocus.focusFromTap()) return;
    const trigger = triggerOf(event.target);
    if (trigger) show(trigger);
  };
  const onFocusOut = (event: FocusEvent) => {
    if (triggerOf(event.target) === active) hide();
  };
  const onPointerDown = () => hide();
  // A scroll moves the trigger out from under its tip. One inside a box that does not hold the
  // trigger, such as a log that follows its last line, moves nothing and leaves the tip up.
  const onScroll = (event: Event) => {
    if (!active) return;
    if (event.target instanceof view.Node && !event.target.contains(active)) return;
    hide();
  };

  doc.addEventListener("pointerover", onPointerOver);
  doc.addEventListener("pointerout", onPointerOut);
  doc.addEventListener("focusin", onFocusIn);
  doc.addEventListener("focusout", onFocusOut);
  doc.addEventListener("pointerdown", onPointerDown, true);
  view.addEventListener("scroll", onScroll, true);
  return () => {
    hide();
    relabelled.disconnect();
    tapFocus.dispose();
    doc.removeEventListener("pointerover", onPointerOver);
    doc.removeEventListener("pointerout", onPointerOut);
    doc.removeEventListener("focusin", onFocusIn);
    doc.removeEventListener("focusout", onFocusOut);
    doc.removeEventListener("pointerdown", onPointerDown, true);
    view.removeEventListener("scroll", onScroll, true);
  };
}

const SYMBOL_CARD_CLASS =
  "fixed z-50 flex max-w-xs flex-col rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text shadow-lg";
const SYMBOL_HIDE_DELAY_MS = 120;

export interface SymbolTooltipOptions {
  /** Non-default version ids, so a historical page loads its own symbol index. */
  versionIds: readonly string[];
  /** Where the symbol index comes from; the default fetches this page's own index. */
  loadIndex?: () => Promise<Record<string, SymbolEntry>>;
}

function fetchSymbolIndex(versionIds: readonly string[]): Promise<Record<string, SymbolEntry>> {
  // Resolve the version-correct index for this page: a historical
  // `/api/<version-id>/…` route loads `symbol-index-<version-id>.json`, a
  // canonical route the default `symbol-index.json`, so same-name symbols
  // whose signatures differ across releases tool-tip against their own
  // version rather than silently against the default surface. Dev appends a
  // per-load `?t=` so Safari can't serve a stale index after a regen (only
  // `?t=` is whitelisted — any other query string 404s and aborts the load
  // before listeners attach); prod uses the stable cached path.
  const indexFile = symbolIndexFileForRoute(window.location.pathname, versionIds);
  const base = withBase(`/${indexFile}`);
  const url = import.meta.env.DEV ? `${base}?t=${Date.now()}` : base;
  return fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`index fetch returned ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<Record<string, SymbolEntry>>;
  });
}

// The symbol an element's prose belongs to: an `.api-symbol-body` is rendered
// right after its signature heading (`###`, or `####` under a group), so the
// owning symbol is that heading's `code.api-signature`. Mentions outside any
// symbol body (the module intro) have no owner and so are never self-references.
function ownerSignature(el: Element): string {
  const heading = el.closest(".api-symbol-body")?.previousElementSibling;
  return heading?.querySelector(".api-signature")?.textContent ?? "";
}

/**
 * Reference cards for the API symbols a page's prose mentions: each inline
 * `<code>` naming an indexed symbol, and each `a.symbol-xref` cross-reference,
 * shows the symbol's brief and a link to its heading on hover or focus.
 */
export function mountSymbolTooltips(body: Element, options: SymbolTooltipOptions): Cleanup {
  const doc = body.ownerDocument;
  const view = doc.defaultView ?? window;
  const loadIndex = options.loadIndex ?? (() => fetchSymbolIndex(options.versionIds));

  const card = doc.createElement("div");
  card.setAttribute("role", "tooltip");
  card.className = SYMBOL_CARD_CLASS;
  const reference = doc.createElement("a");
  reference.className = "block shrink-0 font-medium text-accent hover:underline";
  reference.textContent = "View reference →";
  const briefBox = doc.createElement("div");
  briefBox.className = "mt-1 min-h-0 overflow-y-auto";
  const briefText = doc.createElement("p");
  briefText.className = "text-text-muted";
  briefBox.append(briefText);
  card.append(reference);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelHide = () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimer = setTimeout(() => card.remove(), SYMBOL_HIDE_DELAY_MS);
  };
  card.addEventListener("pointerenter", cancelHide);
  card.addEventListener("pointerleave", scheduleHide);

  let active = true;
  const cleanups: Cleanup[] = [];

  // `isLink` candidates are already-styled `<a>` cross-references, so they
  // skip the `.symbol-link` dotted underline and tabindex; inline `<code>`
  // gets both. Everything else (hover/focus card, cleanup discipline) is
  // shared. Every candidate that reaches `bind` gets the popup — a
  // cross-reference is navigational and earns a preview whether or not its
  // target lives on this page. The two cases that never reach `bind`: the
  // symbol's own signature heading (filtered structurally below), and a
  // self-reference — a mention of the symbol whose own body it sits in,
  // whose popup would point the reader back to where they already are.
  const bind = (el: HTMLElement, brief: string, href: string, isLink: boolean) => {
    if (!isLink) {
      el.classList.add("symbol-link");
      el.setAttribute("tabindex", "0");
    }
    const show = () => {
      cancelHide();
      const rect = el.getBoundingClientRect();
      const { top, left, maxHeight } = tooltipPosition({
        rectLeft: rect.left,
        rectBottom: rect.bottom,
        innerWidth: view.innerWidth,
        innerHeight: view.innerHeight,
      });
      reference.href = href;
      briefText.textContent = brief;
      if (brief) card.append(briefBox);
      else briefBox.remove();
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
      card.style.maxHeight = `${maxHeight}px`;
      if (!card.isConnected) doc.body.append(card);
    };
    el.addEventListener("pointerenter", show);
    el.addEventListener("focus", show);
    el.addEventListener("pointerleave", scheduleHide);
    el.addEventListener("blur", scheduleHide);
    cleanups.push(() => {
      if (!isLink) {
        el.classList.remove("symbol-link");
        el.removeAttribute("tabindex");
      }
      el.removeEventListener("pointerenter", show);
      el.removeEventListener("focus", show);
      el.removeEventListener("pointerleave", scheduleHide);
      el.removeEventListener("blur", scheduleHide);
    });
  };

  // A self-reference earns no popup — it points the reader to the symbol
  // they are already reading. Mark it with a gentle underline so the term
  // still reads as "the current symbol" rather than plain prose.
  const markSelf = (el: HTMLElement) => {
    el.classList.add("symbol-self");
    cleanups.push(() => el.classList.remove("symbol-self"));
  };

  const bindAll = (index: Record<string, SymbolEntry>) => {
    for (const code of body.querySelectorAll<HTMLElement>("code")) {
      if (code.closest("pre")) continue;
      // The symbol's own `### signature` heading renders as
      // `code.api-signature` — the definition the reader is already on, the
      // one genuinely redundant popup.
      if (code.matches(".api-signature")) continue;
      const key = normalizeSymbolKey(code.textContent ?? "");
      const entry = index[key];
      if (!entry) continue;
      if (isSelfReference(key, ownerSignature(code))) {
        markSelf(code);
        continue;
      }
      bind(code, entry.brief, withBase(entry.route), false);
    }

    for (const link of body.querySelectorAll<HTMLAnchorElement>("a.symbol-xref")) {
      const key = normalizeSymbolKey(link.textContent ?? "");
      const entry = index[key];
      // The anchor's own href already carries the deploy base; only an
      // index route still needs it.
      const href = entry ? withBase(entry.route) : (link.getAttribute("href") ?? "");
      if (!href) continue;
      if (isSelfReference(key, ownerSignature(link))) {
        markSelf(link);
        continue;
      }
      bind(link, entry?.brief ?? "", href, true);
    }
  };

  loadIndex().then(
    (index) => {
      if (active) bindAll(index);
    },
    (err: unknown) => {
      // Without this handler, any rejection (network, MIME, JSON parse) is
      // swallowed and the listeners never get attached — every symbol
      // would render as plain text and the tooltip would never appear.
      console.error("mountSymbolTooltips: failed to load symbol index", err);
    },
  );

  return () => {
    active = false;
    cancelHide();
    card.remove();
    for (const cleanup of cleanups) cleanup();
  };
}

const SIDEBAR_TIP_CLASS =
  "pointer-events-none fixed z-50 max-w-xs -translate-y-1/2 whitespace-normal break-words rounded-md border border-border-strong bg-surface px-3 py-2 text-sm leading-relaxed text-text shadow-lg";
const SIDEBAR_TIP_GAP_PX = 8;

/**
 * Hover tooltips for the left sidebar's (truncated) page links — the mirror of
 * the "On this page" rail's tooltips, but anchored to the RIGHT of each label
 * since the sidebar hugs the left edge.
 *
 * The listeners sit on the sidebar itself in the capture phase, which sees the
 * non-bubbling `pointerenter` and `focus` of every link inside it, so a link the
 * sidebar renders after mounting (an opened folder) gets its tip too.
 *
 * Touch handling: a tooltip is a hover affordance, and the axis that breaks it
 * is the POINTER, not the viewport. Rather than gate on a (fragile, primary-
 * pointer) media query, we suppress per interaction: ignore non-mouse pointer
 * events, ignore a focus that came from a tap, and dismiss on any tap
 * (`pointerdown`) or scroll — so a tip never sticks without a `pointerleave`.
 */
export function mountSidebarTooltips(sidebar: Element): Cleanup {
  const doc = sidebar.ownerDocument;
  const view = doc.defaultView ?? window;
  const tip = doc.createElement("div");
  tip.setAttribute("role", "tooltip");
  tip.className = SIDEBAR_TIP_CLASS;
  const hide = () => tip.remove();

  const linkOf = (target: EventTarget | null): HTMLElement | null =>
    target instanceof view.HTMLElement && target !== sidebar && target.matches("a[href]")
      ? target
      : null;

  // The most recent interaction's modality, so a focus raised by a tap (which
  // carries no pointerType) doesn't pop a tooltip on a phone.
  let lastWasTouch = false;
  const onDocPointerDown = (event: PointerEvent) => {
    lastWasTouch = event.pointerType !== "mouse";
    hide();
  };

  const show = (event: Event) => {
    const link = linkOf(event.target);
    if (!link) return;
    if (event.type === "pointerenter" && (event as PointerEvent).pointerType !== "mouse") return;
    if (event.type === "focus" && lastWasTouch) return;
    // A row may name itself more fully than its label does — a library row
    // carries its whole `owner/repo/namespace` path in `data-tooltip`. An icon
    // link has no label text, so it is named by its `aria-label`.
    const text =
      link.dataset.tooltip || link.textContent?.trim() || link.getAttribute("aria-label") || "";
    if (!text) return;
    const r = link.getBoundingClientRect();
    tip.textContent = text;
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.style.left = `${r.right + SIDEBAR_TIP_GAP_PX}px`;
    if (!tip.isConnected) doc.body.append(tip);
  };
  const onLeave = (event: Event) => {
    if (linkOf(event.target)) hide();
  };

  sidebar.addEventListener("pointerenter", show, true);
  sidebar.addEventListener("focus", show, true);
  sidebar.addEventListener("pointerleave", onLeave, true);
  sidebar.addEventListener("blur", onLeave, true);
  doc.addEventListener("pointerdown", onDocPointerDown, true);
  view.addEventListener("scroll", hide, true);
  return () => {
    hide();
    sidebar.removeEventListener("pointerenter", show, true);
    sidebar.removeEventListener("focus", show, true);
    sidebar.removeEventListener("pointerleave", onLeave, true);
    sidebar.removeEventListener("blur", onLeave, true);
    doc.removeEventListener("pointerdown", onDocPointerDown, true);
    view.removeEventListener("scroll", hide, true);
  };
}
