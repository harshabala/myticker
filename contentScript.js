// Injects the ticker strip into every page and keeps it updated from storage.

let STORAGE_KEYS;
let formatQuotePrice;
let formatSigned;
let formatSignedCurrency;
let isHostTapeExcluded;
let describeFreshness;

const TICKER_CONTAINER_ID = "pts-ticker-container";
const TAPE_RESERVATION_PROPERTY = "--myticker-tape-reservation";
// Keep primary selector simple so hosts and tests can resolve it reliably.
const CHATGPT_DIALOG_SELECTOR = "dialog[open]";
const TAPE_OBSERVER_OPTIONS = {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["open", "class", "style", "hidden"]
};

/** Closed shadow root kept in-module so host pages cannot scrape holdings DOM. */
let tickerHost = null;
let tickerShadow = null;
let tickerBar = null;
let latestState;
let latestStateResolved = false;
let tickerSettings = null;
let reducedMotionMq = { matches: false, addEventListener() {} };
let tapeReservation = null;
// Moves fixed and sticky page elements down by the strip height (tapeLayout.js).
let layoutBridge = null;
let pageShifter = null;
let tapeReservationDirty = false;
// Fullscreen and print: the strip hides and the page returns to its own layout.
let tapeSuspended = false;
let printingNow = false;
let printMq = null;
let tapeResizeObserver = null;
let tapeDocumentObserver = null;
let chatgptDialog = null;
let tapeReconcileFrame = null;
let cancelTickerExit = null;
let extensionContextAlive = true;
// ticker.css loads asynchronously into the shadow root. Until it does, the
// unstyled bar stacks its items (hundreds of px tall): keep it hidden and do
// not reserve page space, or every page load jumps down and back.
let tapeStylesReady = false;

function isContextInvalidated(error) {
  return /extension context invalidated/i.test(String(error?.message || error || ""));
}

function teardownForInvalidatedContext() {
  if (!extensionContextAlive) return;
  extensionContextAlive = false;
  cancelTapeReconciliation();
  cancelTickerExit?.();
  tapeResizeObserver?.disconnect();
  tapeDocumentObserver?.disconnect();
  tapeResizeObserver = null;
  tapeDocumentObserver = null;
  reducedMotionMq?.removeEventListener?.("change", onReducedMotionChange);
  clearTapeReservation();
  tickerHost?.remove?.();
  tickerHost = null;
  tickerShadow = null;
  tickerBar = null;
}

function reportLifecycle(stage, error) {
  if (!extensionContextAlive) return;
  try {
    const pending = chrome.runtime.sendMessage({
      type: "content-script-lifecycle",
      payload: {
        stage,
        origin: globalThis.location?.origin || "",
        error: error ? { name: String(error.name || "Error"), message: String(error.message || "") } : undefined
      }
    });
    if (pending?.catch) pending.catch((sendError) => {
      if (isContextInvalidated(sendError)) teardownForInvalidatedContext();
    });
  } catch (sendError) {
    if (isContextInvalidated(sendError)) teardownForInvalidatedContext();
    // Diagnostics must never make the page integration fail.
  }
}

function reportFatal(error) {
  reportLifecycle("fatal-error", error);
  console.warn("[MyTicker] content script initialization failed", error);
}

function runSafely(work) {
  if (!extensionContextAlive) return;
  try {
    work();
  } catch (error) {
    if (isContextInvalidated(error)) {
      teardownForInvalidatedContext();
      return;
    }
    reportFatal(error);
  }
}

function prefersReducedMotion() {
  return reducedMotionMq.matches;
}

/**
 * Global off or this host is on the Appearance exclusion list. No saved
 * settings means defaults (enabled), as in the worker and popup: pts_settings
 * is only written once the user saves something in Settings.
 */
function shouldShowTape(settings = tickerSettings) {
  settings = settings || {};
  if (settings.enabled === false) return false;
  try {
    const host = globalThis.location?.hostname || "";
    if (typeof isHostTapeExcluded === "function" && isHostTapeExcluded(host, settings.excludedSites)) {
      return false;
    }
  } catch {
    // location can throw in edge contexts; fail open only when globally enabled
  }
  return true;
}

function onReducedMotionChange() {
  runSafely(() => {
    if (tickerBar) {
      tickerBar.classList.toggle("pts-reduced-motion", prefersReducedMotion());
      chrome.storage.local.get([STORAGE_KEYS.positionsState], (data) => {
        runSafely(() => {
          const state = data[STORAGE_KEYS.positionsState];
          latestState = state;
          latestStateResolved = true;
          renderTicker(state);
        });
      });
    }
  });
}

function bootstrap() {
  try {
    const bridge = globalThis.__MYTICKER_CONTENT_SHARED__;
    if (!bridge) throw new Error("Content shared bridge was not loaded");
    ({ STORAGE_KEYS, formatQuotePrice, formatSigned, formatSignedCurrency, isHostTapeExcluded, describeFreshness } = bridge);
    if (typeof isHostTapeExcluded !== "function") {
      isHostTapeExcluded = () => false;
    }
    layoutBridge = globalThis.__MYTICKER_LAYOUT__ || null;
    reportLifecycle("loaded");
    if (!extensionContextAlive) return;
    reducedMotionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionMq.addEventListener("change", onReducedMotionChange);
    listenForSuspension();
    listenForPopup();
    init();
  } catch (error) {
    reportFatal(error);
  }
}

bootstrap();

/**
 * The popup asks the page it was opened over for its host name and a layout
 * diagnostic. Nothing here reads page content, holdings, symbols or amounts.
 */
function buildLayoutDiagnostic() {
  const root = document.documentElement;
  const barHeight = Math.round((Number(tickerBar?.getBoundingClientRect?.().height) || 0) * 10) / 10;
  let version = "unknown";
  try { version = chrome.runtime.getManifest().version; } catch { /* keep unknown */ }
  return [
    "MyTicker layout report",
    `version: ${version}`,
    `host: ${globalThis.location?.hostname || "unknown"}`,
    `viewport: ${globalThis.innerWidth}x${globalThis.innerHeight}`,
    `strip: ${tickerBar && !tapeSuspended ? "shown" : "not shown"}, height ${barHeight}px`,
    `suspended (fullscreen or print): ${tapeSuspended ? "yes" : "no"}`,
    `page offset (root margin-top): ${root.style.getPropertyValue("margin-top") || "none"}`,
    `fixed or sticky elements moved: ${pageShifter?.trackedCount ?? 0}`,
    `frames: ${globalThis.frames?.length ?? 0}`,
    `shadow roots seen: ${pageShifter?.rootCount ?? 0}`
  ].join("\n");
}

function listenForPopup() {
  chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    if (sender?.id !== chrome.runtime.id) return;
    if (message?.type === "myticker-site-info") {
      sendResponse({ hostname: globalThis.location?.hostname || "" });
    } else if (message?.type === "myticker-layout-diagnostic") {
      sendResponse({ report: buildLayoutDiagnostic() });
    }
  });
}

function shouldSuspendTape() {
  return Boolean(document.fullscreenElement) || printingNow || Boolean(printMq?.matches);
}

function listenForSuspension() {
  try {
    printMq = window.matchMedia("(print)");
    printMq.addEventListener("change", () => runSafely(syncTapeSuspension));
  } catch {
    printMq = null;
  }
  document.addEventListener?.("fullscreenchange", () => runSafely(syncTapeSuspension));
  window.addEventListener?.("beforeprint", () => { printingNow = true; runSafely(syncTapeSuspension); });
  window.addEventListener?.("afterprint", () => { printingNow = false; runSafely(syncTapeSuspension); });
}

/** Hide the strip and give the page back its own layout, or undo that. */
function syncTapeSuspension() {
  const suspend = shouldSuspendTape();
  if (suspend === tapeSuspended) return;
  tapeSuspended = suspend;
  if (!tickerHost) return;
  if (suspend) {
    clearTapeReservation();
    tickerHost.style.setProperty("display", "none", "important");
  } else {
    tickerHost.style.removeProperty("display");
    applyTapeReservation();
    observeTapeReservation();
    observeTapeDocument();
  }
}

function init() {
  if (!extensionContextAlive) return;
  chrome.storage.sync.get([STORAGE_KEYS.settings], (data) => {
    if (!extensionContextAlive) return;
    try {
      const settings = data[STORAGE_KEYS.settings];
      tickerSettings = settings;
      reportLifecycle("storage-settings-read");
      if (shouldShowTape(settings)) {
        ensureTickerContainer(false);
        applyTickerSpeed(settings);
        applyTapeSize(settings);
        applyTickerTheme(settings);
      }
    } catch (error) {
      reportFatal(error);
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    runSafely(() => {
      if (areaName === "sync" && changes[STORAGE_KEYS.settings]) {
        const newSettings = changes[STORAGE_KEYS.settings].newValue;
        tickerSettings = newSettings;
        if (shouldShowTape(newSettings)) {
          ensureTickerContainer(true);
          applyTickerSpeed(newSettings);
          applyTapeSize(newSettings);
          applyTickerTheme(newSettings);
        } else {
          removeTickerContainer();
        }
      }

      if (areaName === "local" && changes[STORAGE_KEYS.positionsState]) {
        const state = changes[STORAGE_KEYS.positionsState].newValue;
        latestState = state;
        latestStateResolved = true;
        renderTicker(state);
      }
    });
  });

  chrome.storage.local.get([STORAGE_KEYS.positionsState], (data) => {
    if (!extensionContextAlive) return;
    runSafely(() => {
      const state = data[STORAGE_KEYS.positionsState];
      latestState = state;
      latestStateResolved = true;
      renderTicker(state);
    });
  });
}

function snapshotInlineValue(style, property) {
  return {
    value: style.getPropertyValue ? style.getPropertyValue(property) : style[property] || "",
    priority: style.getPropertyPriority?.(property) || ""
  };
}

function restoreInlineValue(style, property, snapshot) {
  const { value, priority } = snapshot;
  if (style.setProperty) {
    if (value) style.setProperty(property, value, priority);
    else style.removeProperty?.(property);
    return;
  }
  style[property] = value;
}

function isChatGptPage() {
  const hostname = globalThis.location?.hostname;
  return hostname === "chatgpt.com" || hostname === "chat.openai.com";
}

// The reservation lives on the root element's margin, not the body's: a root
// margin never collapses with the first child's margin, so the page moves by
// exactly the strip's height whatever margins the page has.
function getOriginalRootMarginPx(root) {
  const inlineMargin = Number.parseFloat(snapshotInlineValue(root.style, "margin-top").value);
  if (Number.isFinite(inlineMargin)) return inlineMargin;
  const computedMargin = Number.parseFloat(globalThis.getComputedStyle?.(root).marginTop);
  return Number.isFinite(computedMargin) ? computedMargin : 0;
}

function isFullScreenDialog(dialog) {
  if (!dialog?.hasAttribute("open")) return false;
  const position = dialog.style.getPropertyValue("position") || globalThis.getComputedStyle?.(dialog).position;
  if (position !== "fixed") return false;
  const rect = dialog.getBoundingClientRect?.();
  const viewportWidth = globalThis.innerWidth || document.documentElement?.clientWidth || 0;
  const viewportHeight = globalThis.innerHeight || document.documentElement?.clientHeight || 0;
  const tolerance = 2;
  return Boolean(
    rect && viewportWidth && viewportHeight &&
    rect.top <= tolerance && rect.left <= tolerance &&
    rect.width >= viewportWidth - tolerance && rect.height >= viewportHeight - tolerance
  );
}

function applyChatGptReservation(height) {
  if (!isChatGptPage()) {
    clearChatGptReservation();
    return;
  }
  const dialog = document.querySelector?.(CHATGPT_DIALOG_SELECTOR) || null;
  const trackedDialog = chatgptDialog?.element === dialog && dialog?.hasAttribute("open");
  if (!trackedDialog && chatgptDialog) clearChatGptReservation();
  if (!trackedDialog && !isFullScreenDialog(dialog)) return;
  if (!chatgptDialog) {
    chatgptDialog = {
      element: dialog,
      top: snapshotInlineValue(dialog.style, "top"),
      inset: snapshotInlineValue(dialog.style, "inset"),
      height: snapshotInlineValue(dialog.style, "height")
    };
  }
  dialog.classList.add("myticker-chatgpt-tape-reserved");
  dialog.style.setProperty("top", `${height}px`, "important");
  dialog.style.setProperty("inset", `${height}px 0 0`, "important");
  dialog.style.setProperty("height", `calc(100% - ${height}px)`, "important");
}

function clearChatGptReservation() {
  if (!chatgptDialog) return;
  chatgptDialog.element.classList.remove("myticker-chatgpt-tape-reserved");
  restoreInlineValue(chatgptDialog.element.style, "top", chatgptDialog.top);
  restoreInlineValue(chatgptDialog.element.style, "inset", chatgptDialog.inset);
  restoreInlineValue(chatgptDialog.element.style, "height", chatgptDialog.height);
  chatgptDialog = null;
}

function applyTapeReservation() {
  if (!tickerBar || !document.body || !tapeStylesReady || tapeSuspended) return;
  const root = document.documentElement;

  if (!tapeReservation) {
    tapeReservation = {
      rootMarginTop: snapshotInlineValue(root.style, "margin-top"),
      rootScrollPaddingTop: snapshotInlineValue(document.documentElement.style, "scroll-padding-top"),
      rootReservation: snapshotInlineValue(document.documentElement.style, TAPE_RESERVATION_PROPERTY),
      rootHadStyleAttr: root.hasAttribute?.("style") ?? true,
      originalPx: getOriginalRootMarginPx(root)
    };
  }

  const height = Math.max(0, Number(tickerBar.getBoundingClientRect?.().height) || 0);
  root.style.setProperty("margin-top", `${tapeReservation.originalPx + height}px`, "important");
  document.documentElement.style.setProperty("scroll-padding-top", `${height}px`, "important");
  document.documentElement.style.setProperty(TAPE_RESERVATION_PROPERTY, `${height}px`, "important");
  applyChatGptReservation(height);
  if (layoutBridge) {
    if (!pageShifter) {
      pageShifter = layoutBridge.createPageShifter({
        observeRoot: (root) => tapeDocumentObserver?.observe?.(root, TAPE_OBSERVER_OPTIONS),
        isOwned: (el) => el === tickerHost || el === chatgptDialog?.element,
        // Our own style writes are not page changes: drop their records.
        afterWrite: () => tapeDocumentObserver?.takeRecords?.()
      });
    }
    pageShifter.setHeight(height);
  }
  tapeDocumentObserver?.takeRecords?.();
}

function observeTapeReservation() {
  tapeResizeObserver?.disconnect();
  tapeResizeObserver = null;
  if (typeof ResizeObserver !== "function" || !tickerBar) return;
  tapeResizeObserver = new ResizeObserver(() => runSafely(applyTapeReservation));
  tapeResizeObserver.observe(tickerBar);
}

function observeTapeDocument() {
  tapeDocumentObserver?.disconnect();
  tapeDocumentObserver = null;
  if (typeof MutationObserver !== "function" || !document.documentElement) return;
  tapeDocumentObserver = new MutationObserver((records) => runSafely(() => {
    if (!tickerBar) return;
    const hasRelevantChange = records.some((record) =>
      record.type === "childList" || (record.type === "attributes" && record.attributeName === "open")
    );
    const shifterQueued = pageShifter?.noteRecords(records) === true;
    if (!hasRelevantChange && !shifterQueued) return;
    if (hasRelevantChange) tapeReservationDirty = true;
    queueTapeReconciliation();
  }));
  tapeDocumentObserver.observe(document.documentElement, TAPE_OBSERVER_OPTIONS);
  pageShifter?.reobserve();
}

function queueTapeReconciliation() {
  if (!extensionContextAlive || tapeReconcileFrame !== null) return;
  tapeReconcileFrame = requestAnimationFrame(() => {
    tapeReconcileFrame = null;
    runSafely(() => {
      if (!tickerBar || tapeSuspended) return;
      const reservationDirty = tapeReservationDirty;
      tapeReservationDirty = false;
      if (!tapeReservation) {
        applyTapeReservation();
        observeTapeReservation();
        observeTapeDocument();
        return;
      }
      if (reservationDirty) applyTapeReservation();
      pageShifter?.flush();
    });
  });
}

function cancelTapeReconciliation() {
  if (tapeReconcileFrame === null) return;
  cancelAnimationFrame?.(tapeReconcileFrame);
  tapeReconcileFrame = null;
}

function clearTapeReservation() {
  cancelTapeReconciliation();
  tapeResizeObserver?.disconnect();
  tapeResizeObserver = null;
  tapeDocumentObserver?.disconnect();
  tapeDocumentObserver = null;
  clearChatGptReservation();
  pageShifter?.stop();
  pageShifter = null;
  if (!tapeReservation) return;

  const { rootMarginTop, rootScrollPaddingTop, rootReservation, rootHadStyleAttr } = tapeReservation;
  restoreInlineValue(document.documentElement.style, "margin-top", rootMarginTop);
  restoreInlineValue(document.documentElement.style, "scroll-padding-top", rootScrollPaddingTop);
  restoreInlineValue(document.documentElement.style, TAPE_RESERVATION_PROPERTY, rootReservation);
  const root = document.documentElement;
  if (!rootHadStyleAttr && root.getAttribute("style") === "") root.removeAttribute("style");
  tapeReservation = null;
}

function ensureTickerContainer(animate = false) {
  const hostMounted = document.documentElement.contains?.(tickerHost) ?? tickerHost?.parentNode === document.documentElement;
  if (tickerHost && hostMounted && tickerBar) {
    cancelTickerExit?.();
    if (!tapeReservation) {
      applyTapeReservation();
      observeTapeReservation();
    }
    return;
  }

  if (!document.body) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        runSafely(() => ensureTickerContainer(animate));
      },
      { once: true }
    );
    return;
  }

  // Host is a zero-size mount; UI lives in closed shadow (pages cannot scrape P&L DOM).
  tickerHost = document.createElement("div");
  tickerHost.id = TICKER_CONTAINER_ID;
  tickerHost.setAttribute("data-myticker", "1");
  tickerHost.style.cssText = "all:initial;position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483000;pointer-events:none;";

  tickerShadow = tickerHost.attachShadow({ mode: "closed" });

  tapeStylesReady = false;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("ticker.css");

  tickerBar = document.createElement("div");
  tickerBar.className = "pts-ticker-bar";
  tickerBar.style.pointerEvents = "auto";
  tickerBar.style.setProperty("visibility", "hidden");
  const bar = tickerBar;
  // On error too: an unstyled tape beats a missing one.
  const onStylesSettled = () => runSafely(() => {
    if (tickerBar !== bar) return;
    tapeStylesReady = true;
    bar.style.removeProperty("visibility");
    applyTapeReservation();
  });
  link.addEventListener("load", onStylesSettled, { once: true });
  link.addEventListener("error", onStylesSettled, { once: true });
  tickerShadow.appendChild(link);
  if (prefersReducedMotion() || !animate) {
    tickerBar.classList.add("pts-reduced-motion", "pts-ticker-visible");
  }
  tickerShadow.appendChild(tickerBar);

  // The body can be replaced by SPA navigation between the guard above and an
  // insertBefore call. Appending to the stable document root prevents that
  // race from aborting the content script on sites such as LinkedIn.
  tapeSuspended = shouldSuspendTape();
  if (tapeSuspended) tickerHost.style.setProperty("display", "none", "important");
  document.documentElement.appendChild(tickerHost);
  reportLifecycle("mount-success");

  applyTapeSize(tickerSettings);
  applyTickerTheme(tickerSettings);
  applyTapeReservation();
  observeTapeReservation();
  observeTapeDocument();

  if (!prefersReducedMotion() && animate) {
    const enteringBar = tickerBar;
    requestAnimationFrame(() => {
      // The strip can be hidden (popup, keyboard) before this frame runs.
      if (tickerBar === enteringBar) enteringBar.classList.add("pts-ticker-visible");
    });
  }

  // Storage can resolve before a late page body lets us mount. Re-render the
  // cached state once this bar exists rather than dropping that first paint.
  renderTicker(latestState);
}

function removeTickerContainer() {
  if (!tickerHost || !tickerBar) {
    clearTapeReservation();
    tickerHost = null;
    tickerShadow = null;
    tickerBar = null;
    return;
  }

  const host = tickerHost;
  const bar = tickerBar;

  let finished = false;
  let cancelled = false;
  let exitTimer = null;
  const finish = () => {
    if (finished || cancelled) return;
    finished = true;
    if (host.parentNode) host.parentNode.removeChild(host);
    delete bar._ptsParts;
    tickerHost = null;
    tickerShadow = null;
    tickerBar = null;
    cancelTickerExit = null;
  };

  if (prefersReducedMotion()) {
    clearTapeReservation();
    finish();
    return;
  }

  bar.classList.remove("pts-ticker-visible");
  bar.classList.add("pts-ticker-exiting");
  // Page reservation changes are deliberately immediate: the tape can be
  // toggled by keyboard and must never animate host-page layout or force sync
  // reflow. Only the tape itself uses transform/opacity on exit.
  clearTapeReservation();

  const onEnd = (e) => {
    if (e.propertyName !== "opacity") return;
    finish();
  };
  bar.addEventListener("transitionend", onEnd, { once: true });
  exitTimer = setTimeout(finish, 200);
  cancelTickerExit = () => {
    if (finished || cancelled) return;
    cancelled = true;
    clearTimeout(exitTimer);
    bar.classList.remove("pts-ticker-exiting");
    bar.classList.add("pts-ticker-visible");
    cancelTickerExit = null;
  };
}

function getTickerParts(container) {
  if (!container._ptsParts) {
    const aggregate = document.createElement("div");
    aggregate.className = "pts-aggregate";
    aggregate.setAttribute("role", "status");
    aggregate.setAttribute("aria-label", "Portfolio day profit and loss");

    const scrollWrapper = document.createElement("div");
    scrollWrapper.className = "pts-scroll-wrapper";
    scrollWrapper.setAttribute("tabindex", "0");
    scrollWrapper.setAttribute("role", "group");
    scrollWrapper.setAttribute("aria-label", "Market tape. Focus pauses scrolling.");
    const scrollInner = document.createElement("div");
    scrollInner.className = "pts-scroll-inner";
    scrollWrapper.appendChild(scrollInner);

    container.appendChild(aggregate);
    container.appendChild(scrollWrapper);

    container._ptsParts = {
      stale: null,
      aggregate,
      scrollWrapper,
      scrollInner
    };
  }
  return container._ptsParts;
}

function positionKey(pos) {
  const sym = String(pos.symbol || pos.displayName || "").toUpperCase();
  const broker = String(pos.brokerId || "").toUpperCase();
  const exchange = String(pos.exchange || "").toUpperCase();
  return `${sym}|${broker}|${exchange}`;
}

function updateStaleIndicator(container, parts, state) {
  const freshness = typeof describeFreshness === "function"
    ? describeFreshness(state, Date.now(), state?.refreshMinutes)
    : state?.staleWarning ? "stale" : "live";
  if (freshness === "stale") {
    if (!parts.stale) {
      parts.stale = document.createElement("div");
      parts.stale.className = "pts-stale-indicator";
      parts.stale.setAttribute("role", "status");
      parts.stale.title =
        "Price data may be outdated – check your API key or network";
      container.insertBefore(parts.stale, container.firstChild);
    }
    parts.stale.textContent = "⚠ Stale";
  } else if (parts.stale) {
    parts.stale.remove();
    parts.stale = null;
  }
}

function updateAggregate(parts, state) {
  const aggregate = parts.aggregate;
  const aggPnl = Number(state?.aggregate?.dayPnl) || 0;
  const aggPct = Number(state?.aggregate?.dayPnlPct) || 0;
  const currency = state?.displayCurrency;
  const dirClass = aggPnl > 0 ? "pts-up" : aggPnl < 0 ? "pts-down" : "pts-flat";
  const newSign = aggPnl > 0 ? "up" : aggPnl < 0 ? "down" : "flat";

  aggregate.classList.remove("pts-up", "pts-down", "pts-flat");
  aggregate.classList.add(dirClass);

  aggregate.dataset.ptsSign = newSign;

  aggregate.textContent = currency
    ? `MyTicker · Today ${formatSignedCurrency(aggPnl, currency)} (${formatSigned(aggPct)}%)`
    : "MyTicker · Today mixed currencies";
}

function buildItemElement(pos) {
  const item = document.createElement("div");
  item.className = "pts-item";
  item.dataset.ptsKey = positionKey(pos);

  const groupSpan = document.createElement("span");
  groupSpan.className = "pts-group-marker";

  const nameSpan = document.createElement("span");
  nameSpan.className = "pts-symbol";

  const priceSpan = document.createElement("span");
  priceSpan.className = "pts-price";

  const changeSpan = document.createElement("span");
  changeSpan.className = "pts-change";

  const pnlSpan = document.createElement("span");
  pnlSpan.className = "pts-personal-pnl";

  const staleSpan = document.createElement("span");
  staleSpan.className = "pts-item-stale";
  staleSpan.setAttribute("role", "status");

  item.appendChild(groupSpan);
  item.appendChild(nameSpan);
  item.appendChild(priceSpan);
  item.appendChild(changeSpan);
  item.appendChild(pnlSpan);
  item.appendChild(staleSpan);

  return item;
}

function updateItemElement(item, pos, isGroupBoundary) {
  const changePct = Number.isFinite(Number(pos.changePct))
    ? Number(pos.changePct)
    : Number(pos.dayPnlPct) || 0;
  const isHolding = (pos.kind || "holding") === "holding";
  const dayPnl = Number(pos.dayPnl) || 0;
  const dirClass = changePct > 0 ? "pts-up" : changePct < 0 ? "pts-down" : "pts-flat";
  item.classList.remove("pts-up", "pts-down", "pts-flat", "pts-crypto");
  item.classList.add(dirClass);
  if (pos.assetClass === "crypto") {
    item.classList.add("pts-crypto");
  }

  item.dataset.ptsKey = positionKey(pos);
  // Privacy: never expose quantity in title attributes (page-scrape surface)
  item.title = `${pos.displayName || pos.symbol || ""} · ${formatSigned(changePct)}%`;

  const [groupSpan, nameSpan, priceSpan, changeSpan, pnlSpan, staleSpan] = item.children;
  groupSpan.textContent = isGroupBoundary ? getGroupLabel(pos.kind) : "";
  groupSpan.hidden = !isGroupBoundary;
  nameSpan.textContent = pos.displayName || pos.symbol || "—";
  priceSpan.textContent = formatQuotePrice(pos.lastPrice, pos.currency || "USD");
  changeSpan.textContent = `${formatSigned(changePct)}%`;
  // null day P&L = no previous close from the provider: unknown, not zero.
  const pnlText = pos.dayPnl == null ? "—" : formatSignedCurrency(dayPnl, pos.currency || "USD");
  // Crypto with a quantity: its own 24h P&L, never part of the total.
  const cryptoPnl = pos.kind === "crypto" && pos.dayPnl != null;
  pnlSpan.textContent = isHolding ? `p&l ${pnlText}` : cryptoPnl ? `24h p&l ${pnlText}` : "";
  pnlSpan.hidden = !isHolding && !cryptoPnl;
  staleSpan.textContent = pos.stale ? "stale" : "";
  staleSpan.hidden = !pos.stale;
  staleSpan.setAttribute("aria-label", pos.stale ? "Stale quote" : "");
}

function updateScrollItems(parts, state) {
  const positions = state?.tickerItems || state?.positions || [];
  const reduced = prefersReducedMotion();
  const scrollInner = parts.scrollInner;
  const renderSlots = (slotCount) => {
    while (scrollInner.children.length > slotCount) {
      scrollInner.removeChild(scrollInner.lastChild);
    }

    for (let i = 0; i < slotCount; i++) {
      const pos = positions[i % positions.length];
      if (!pos) continue;

      let item = scrollInner.children[i];
      if (!item) {
        item = buildItemElement(pos);
        scrollInner.appendChild(item);
      }
      const previous = positions[(i - 1 + positions.length) % positions.length];
      const isGroupBoundary = i % positions.length === 0 || previous?.kind !== pos.kind;
      updateItemElement(item, pos, isGroupBoundary);
    }
  };

  // Measure one copy first. Duplicate only when it actually overflows, so the
  // marquee remains the tape's sole continuous animation.
  renderSlots(positions.length);
  const shouldMarquee = !reduced && scrollInner.scrollWidth > parts.scrollWrapper.clientWidth;
  renderSlots(shouldMarquee ? positions.length * 2 : positions.length);

  parts.scrollInner.classList.toggle("pts-scroll-static", !shouldMarquee);
}

function clearTickerContent(container) {
  const parts = container._ptsParts;
  if (parts?.stale) {
    parts.stale.remove();
    parts.stale = null;
  }
  if (parts?.aggregate) {
    parts.aggregate.textContent = "No items — add holdings or a watchlist";
    parts.aggregate.classList.remove("pts-up", "pts-down", "pts-flat");
    parts.aggregate.classList.add("pts-flat");
    delete parts.aggregate.dataset.ptsSign;
  }
  if (parts?.scrollInner) {
    while (parts.scrollInner.firstChild) {
      parts.scrollInner.removeChild(parts.scrollInner.firstChild);
    }
  }
}

function renderTicker(state) {
  if (!tickerBar) return;

  tickerBar.classList.toggle("pts-reduced-motion", prefersReducedMotion());

  if (!latestStateResolved && !state) {
    const parts = getTickerParts(tickerBar);
    parts.aggregate.textContent = "Updating markets";
    parts.aggregate.classList.remove("pts-up", "pts-down");
    parts.aggregate.classList.add("pts-flat");
    while (parts.scrollInner.firstChild) parts.scrollInner.removeChild(parts.scrollInner.firstChild);
    return;
  }

  const items = state?.tickerItems || state?.positions || [];
  if (!items.length) {
    getTickerParts(tickerBar);
    clearTickerContent(tickerBar);
    reportLifecycle("render-success");
    return;
  }

  const parts = getTickerParts(tickerBar);
  updateStaleIndicator(tickerBar, parts, state);
  updateAggregate(parts, state);
  updateScrollItems(parts, state);
  reportLifecycle("render-success");
}

function getGroupLabel(kind) {
  if (kind === "watchlist") return "watchlist";
  if (kind === "crypto") return "crypto";
  return "holdings";
}

function applyTickerSpeed(settings) {
  const duration =
    settings?.tickerStyleConfig?.tickerSpeed ||
    40;
  const value = `${Number(duration)}s`;
  // Only on the bar: the page's own root element is never styled by the strip.
  if (tickerBar) {
    tickerBar.style.setProperty("--pts-ticker-duration", value);
  }
}

function applyTapeSize(settings) {
  const size = normalizeTapeScale(settings?.tickerStyleConfig?.tapeScale);
  const scale = { compact: 0.92, comfortable: 1.08, large: 1.20 }[size];
  if (tickerBar) {
    tickerBar.setAttribute("data-tape-size", size);
    tickerBar.style.setProperty("--pts-tape-scale", String(scale));
  }
  if (tapeReservation) applyTapeReservation();
}

function applyTickerTheme(settings) {
  const theme = ["light", "dark"].includes(settings?.tickerStyleConfig?.theme)
    ? settings.tickerStyleConfig.theme
    : "system";
  if (tickerBar) tickerBar.setAttribute("data-theme", theme);
}

function normalizeTapeScale(value) {
  return ["compact", "comfortable", "large"].includes(value) ? value : "comfortable";
}
