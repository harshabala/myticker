// Copyable Settings diagnostics report. Pure: takes what Settings read from
// storage and returns text. Counts, stages and provider tallies only; never
// symbols, quantities, prices or P&L (users paste this into bug reports).

const LIFECYCLE_COUNT_KEYS = ["holdingsCount", "watchlistCount", "cryptoCount", "equitySymbols", "totalSymbols", "equityQuotes", "cryptoQuotes", "quoteCount"];

function formatDiagnosticTime(timestamp) {
  const time = Number(timestamp);
  return time ? new Date(time).toLocaleString() : "Never";
}

function providerResultLine(lastProviderResults, key, label) {
  const count = Number(lastProviderResults?.[key]) || 0;
  return `${label}: ${count} quote${count === 1 ? "" : "s"} in last provider result`;
}

function formatDiagnosticsReport({
  settings = {},
  holdings = [],
  watchlist = [],
  state = {},
  health = {},
  log = [],
  contentStatus = {},
  vaultStatus = {},
  buildVersion = ""
} = {}) {
  holdings = Array.isArray(holdings) ? holdings : [];
  watchlist = Array.isArray(watchlist) ? watchlist : [];
  log = Array.isArray(log) ? log : [];
  state = state || {};
  health = health || {};
  contentStatus = contentStatus || {};
  const providerResults = [...log].reverse().find((entry) => entry.event === "provider-results");
  const cryptoEnabled = !!settings.cryptoConfig?.includeCrypto && settings.portfolioFilters?.showCrypto !== false;
  const lines = [
    `MyTicker diagnostics · build v${buildVersion}`,
    // pts_settings is only saved once the user saves something: absent = on.
    `Ticker enabled: ${settings.enabled !== false ? "yes" : "no"}`,
    `Holdings: ${holdings.length} · Watchlist: ${watchlist.length} · Ticker items: ${(state.tickerItems || state.positions || []).length}`,
    `Last state update: ${formatDiagnosticTime(state.updatedAt)}`,
    `Poll health: ${Number(health.consecutiveFailures) || 0} consecutive failure(s) · last successful fetch ${formatDiagnosticTime(health.lastSuccessfulFetch)}`,
    `Content script: ${contentStatus.stage || "never reported"} · ${contentStatus.origin || "no page origin"} · ${formatDiagnosticTime(contentStatus.timestamp)}${contentStatus.error ? ` · ${contentStatus.error.name}: ${contentStatus.error.message || ""}` : ""}`,
    "",
    "Provider availability and latest result:",
    `CoinGecko: primary crypto source · ${cryptoEnabled ? "eligible when supported crypto is enabled" : "crypto disabled"} · ${providerResultLine(providerResults, "coinGeckoQuotes", "result")}`,
    `Binance: fallback for mapped liquid crypto only · ${cryptoEnabled ? "available" : "crypto disabled"} · ${providerResultLine(providerResults, "binanceQuotes", "result")}`,
    `Yahoo Finance: automatic for .NS/.BO · available · ${providerResultLine(providerResults, "yahooQuotes", "result")}`,
    `Finnhub: US equities · ${vaultStatus.configured ? (vaultStatus.unlocked ? "key unlocked" : "key locked") : "not configured"} · ${providerResultLine(providerResults, "finnhubQuotes", "result")}`,
    "",
    "Recent refresh lifecycle (safe operational counts only):"
  ];
  if (!log.length) {
    lines.push("No refresh diagnostics recorded yet.");
  } else {
    for (const entry of log.slice(-12)) {
      const details = LIFECYCLE_COUNT_KEYS
        .filter((key) => Number.isFinite(entry[key]))
        .map((key) => `${key.replace("Count", "")}=${entry[key]}`);
      lines.push(`${formatDiagnosticTime(entry.timestamp)} · ${entry.event}${details.length ? ` · ${details.join(", ")}` : ""}${entry.error ? " · Refresh failed" : ""}`);
    }
  }
  return lines.join("\n");
}

export { formatDiagnosticsReport, formatDiagnosticTime };
