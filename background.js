const DEFAULT_REMOTE_LISTS = [
  {
    id: 'easyList',
    name: 'EasyList',
    enabled: true,
    url: 'https://easylist.to/easylist/easylist.txt',
    homepage: 'https://easylist.to/'
  },
  {
    id: 'easyPrivacy',
    name: 'EasyPrivacy',
    enabled: true,
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    homepage: 'https://easylist.to/'
  },
  {
    id: 'easyListCookie',
    name: 'EasyList Cookie',
    enabled: false,
    url: 'https://easylist-downloads.adblockplus.org/easylist-cookie.txt',
    homepage: 'https://easylist.to/'
  }
];

const DEFAULT_STATE = {
  enabled: true,
  popupBlockingEnabled: true,
  cosmeticBlockingEnabled: true,
  scriptletsEnabled: true,
  updateIntervalHours: 24,
  allowlist: [],
  customFiltersText: '',
  customCssSelectors: {},
  remoteLists: DEFAULT_REMOTE_LISTS,
  stats: {
    blockedRequestsTotal: 0,
    blockedPopupsTotal: 0
  },
  logger: [],
  maxLogEntries: 2000,
  ruleHits: {},
  lastUpdatedAt: null
};

const memory = {
  state: clone(DEFAULT_STATE),
  compiled: emptyCompiled(),
  tabStats: {},
  pickerTabs: {},
  pendingPopupCandidates: {},
  tabNavigationMeta: {},
  ready: false
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyCompiled() {
  return {
    networkRules: [],
    exceptionRules: [],
    popupRules: [],
    cosmeticGlobal: [],
    cosmeticByDomain: {},
    cosmeticExceptionsByDomain: {},
    scriptletRules: []
  };
}

function normalizeDomain(value) {
  return String(value || '').trim().replace(/^\.+/, '').toLowerCase();
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch { return fallback; }
}

function getHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
}

function getOrigin(url) {
  try { return new URL(url).origin.toLowerCase(); } catch { return ''; }
}

function getRegistrableLike(host) {
  const parts = normalizeDomain(host).split('.').filter(Boolean);
  return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
}

function isRemoteTo(sourceUrl, targetUrl) {
  const a = getRegistrableLike(getHostname(sourceUrl));
  const b = getRegistrableLike(getHostname(targetUrl));
  return !!a && !!b && a !== b;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseDomainConstraint(raw) {
  const result = { include: [], exclude: [] };
  for (const token of String(raw || '').split('|').map(v => v.trim()).filter(Boolean)) {
    if (token.startsWith('~')) result.exclude.push(normalizeDomain(token.slice(1)));
    else result.include.push(normalizeDomain(token));
  }
  return result;
}

function domainMatches(host, domain) {
  const h = normalizeDomain(host);
  const d = normalizeDomain(domain);
  return !!h && !!d && (h === d || h.endsWith('.' + d));
}

function domainsPass(pageHost, constraints) {
  const host = normalizeDomain(pageHost);
  if (constraints.exclude.some(d => domainMatches(host, d))) return false;
  if (!constraints.include.length) return true;
  return constraints.include.some(d => domainMatches(host, d));
}

function compilePattern(pattern, matchCase) {
  const sourcePattern = pattern || '*';
  if (sourcePattern.startsWith('/') && sourcePattern.endsWith('/') && sourcePattern.length > 2) {
    try { return new RegExp(sourcePattern.slice(1, -1), matchCase ? '' : 'i'); } catch { return /.^/; }
  }

  let source = sourcePattern;
  let prefix = '';
  let suffix = '';

  if (source.startsWith('||')) {
    source = source.slice(2);
    prefix = '^(?:[^:/?#]+:)?//(?:[^/]*\\.)?';
  } else if (source.startsWith('|')) {
    source = source.slice(1);
    prefix = '^';
  }

  if (source.endsWith('|')) {
    source = source.slice(0, -1);
    suffix = '$';
  }

  let out = '';
  for (const ch of source) {
    if (ch === '*') out += '.*';
    else if (ch === '^') out += '(?:[^\\w\\d_.%-]|$)';
    else out += escapeRegex(ch);
  }

  try {
    return new RegExp(prefix + out + suffix, matchCase ? '' : 'i');
  } catch {
    return /.^/;
  }
}

function normalizeType(type) {
  switch (type) {
    case 'main_frame': return 'document';
    case 'sub_frame': return 'subdocument';
    default: return String(type || 'other');
  }
}

function isThirdParty(requestUrl, initiatorUrl) {
  const r = getRegistrableLike(getHostname(requestUrl));
  const i = getRegistrableLike(getHostname(initiatorUrl));
  return !!r && !!i && r !== i;
}

function parseScriptletBody(body) {
  const lower = String(body || '').toLowerCase();
  if (lower.includes('overlay')) return 'overlay-buster';
  if (lower.includes('sticky') || lower.includes('banner')) return 'sticky-banner-buster';
  if (lower.includes('popup')) return 'remove-inpage-popups';
  return 'custom';
}

function parseFilterLine(line) {
  const raw = String(line || '').trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[')) return null;

  if (raw.includes('#@#')) {
    const parts = raw.split('#@#');
    return { kind: 'cosmeticException', domains: String(parts[0] || '').split(',').map(normalizeDomain).filter(Boolean), selector: String(parts[1] || '').trim(), raw };
  }

  if (raw.includes('#$#')) {
    const parts = raw.split('#$#');
    return {
      kind: 'scriptlet',
      domains: String(parts[0] || '').split(',').map(normalizeDomain).filter(Boolean),
      body: String(parts[1] || '').trim(),
      name: parseScriptletBody(parts[1]),
      raw
    };
  }

  if (raw.includes('##')) {
    const parts = raw.split('##');
    return { kind: 'cosmetic', domains: String(parts[0] || '').split(',').map(normalizeDomain).filter(Boolean), selector: String(parts[1] || '').trim(), raw };
  }

  let text = raw;
  let exception = false;
  if (text.startsWith('@@')) {
    exception = true;
    text = text.slice(2);
  }

  let pattern = text;
  const options = {
    types: new Set(),
    excludedTypes: new Set(),
    domains: { include: [], exclude: [] },
    thirdParty: null,
    popup: false,
    matchCase: false,
    important: false
  };

  const dollarIndex = text.indexOf('$');
  if (dollarIndex >= 0) {
    pattern = text.slice(0, dollarIndex);
    const opts = text.slice(dollarIndex + 1).split(',').map(v => v.trim()).filter(Boolean);
    for (const opt of opts) {
      if (opt === 'third-party') options.thirdParty = true;
      else if (opt === '~third-party') options.thirdParty = false;
      else if (opt === 'popup') options.popup = true;
      else if (opt === 'match-case') options.matchCase = true;
      else if (opt === 'important') options.important = true;
      else if (opt.startsWith('domain=')) options.domains = parseDomainConstraint(opt.slice(7));
      else if (opt.startsWith('~')) options.excludedTypes.add(opt.slice(1));
      else options.types.add(opt);
    }
  }

  const rule = {
    kind: exception ? 'exception' : 'network',
    raw,
    pattern,
    regex: compilePattern(pattern || '*', options.matchCase),
    options
  };
  if (options.popup) rule.kind = exception ? 'popupException' : 'popup';
  return rule;
}

function compileAllFilters(state) {
  const compiled = emptyCompiled();
  const textParts = [];
  for (const list of state.remoteLists || []) {
    if (list.enabled && list.cachedText) textParts.push(list.cachedText);
  }
  if (state.customFiltersText) textParts.push(state.customFiltersText);

  for (const part of textParts) {
    for (const line of String(part).split(/\r?\n/)) {
      const rule = parseFilterLine(line);
      if (!rule) continue;
      if (rule.kind === 'network') compiled.networkRules.push(rule);
      else if (rule.kind === 'exception') compiled.exceptionRules.push(rule);
      else if (rule.kind === 'popup') compiled.popupRules.push(rule);
      else if (rule.kind === 'popupException') compiled.exceptionRules.push(rule);
      else if (rule.kind === 'cosmetic') {
        if (!rule.domains.length) compiled.cosmeticGlobal.push(rule.selector);
        else rule.domains.forEach(domain => {
          compiled.cosmeticByDomain[domain] = compiled.cosmeticByDomain[domain] || [];
          compiled.cosmeticByDomain[domain].push(rule.selector);
        });
      } else if (rule.kind === 'cosmeticException') {
        rule.domains.forEach(domain => {
          compiled.cosmeticExceptionsByDomain[domain] = compiled.cosmeticExceptionsByDomain[domain] || [];
          compiled.cosmeticExceptionsByDomain[domain].push(rule.selector);
        });
      } else if (rule.kind === 'scriptlet') {
        compiled.scriptletRules.push(rule);
      }
    }
  }
  return compiled;
}

function matchesRule(rule, request) {
  if (!rule.regex.test(request.url)) return false;
  const requestType = normalizeType(request.type);
  if (rule.options.types.size && !rule.options.types.has(requestType)) return false;
  if (rule.options.excludedTypes.has(requestType)) return false;
  if (rule.options.thirdParty !== null && isThirdParty(request.url, request.initiator || request.documentUrl || '') !== rule.options.thirdParty) return false;
  if (!domainsPass(getHostname(request.initiator || request.documentUrl || ''), rule.options.domains)) return false;
  return true;
}

function isPageAllowlisted(pageUrl) {
  const host = getHostname(pageUrl);
  return (memory.state.allowlist || []).some(entry => domainMatches(host, entry));
}

function ensureTabStats(tabId) {
  memory.tabStats[tabId] = memory.tabStats[tabId] || {
    blocked: 0,
    blockedPopups: 0,
    byHost: {},
    byRule: {},
    recent: []
  };
  return memory.tabStats[tabId];
}

function addLog(item) {
  memory.state.logger.unshift(item);
  memory.state.logger = memory.state.logger.slice(0, memory.state.maxLogEntries || 2000);
}

function incrementRuleHit(ruleText, tabId) {
  if (!ruleText) return;
  memory.state.ruleHits[ruleText] = (memory.state.ruleHits[ruleText] || 0) + 1;
  if (typeof tabId === 'number' && tabId >= 0) {
    const stats = ensureTabStats(tabId);
    stats.byRule[ruleText] = (stats.byRule[ruleText] || 0) + 1;
  }
}

function recordBlock(details, reason, category) {
  const tabId = typeof details.tabId === 'number' ? details.tabId : -1;
  const host = getHostname(details.url);
  const stats = tabId >= 0 ? ensureTabStats(tabId) : null;
  if (stats) {
    if (category === 'popup') stats.blockedPopups += 1;
    else stats.blocked += 1;
    stats.byHost[host] = (stats.byHost[host] || 0) + 1;
    stats.recent.unshift({
      ts: Date.now(),
      category,
      type: details.type || 'popup',
      host,
      url: details.url,
      reason
    });
    stats.recent = stats.recent.slice(0, 50);
  }
  addLog({
    ts: Date.now(),
    tabId,
    category,
    type: details.type || 'popup',
    host,
    url: details.url,
    pageUrl: details.initiator || details.documentUrl || '',
    reason
  });
  incrementRuleHit(reason, tabId);
  if (category === 'popup') memory.state.stats.blockedPopupsTotal += 1;
  else memory.state.stats.blockedRequestsTotal += 1;
  updateBadge(tabId);
}

function updateBadge(tabId) {
  if (typeof tabId !== 'number' || tabId < 0) return;
  const stats = ensureTabStats(tabId);
  const count = (stats.blocked || 0) + (stats.blockedPopups || 0);
  chrome.browserAction.setBadgeBackgroundColor({ tabId, color: '#5b3df5' });
  chrome.browserAction.setBadgeText({ tabId, text: count ? String(count > 999 ? '999+' : count) : '' });
}

async function persistState() {
  return new Promise(resolve => chrome.storage.local.set({ shieldState: memory.state }, resolve));
}

async function loadState() {
  const loaded = await new Promise(resolve => chrome.storage.local.get(['shieldState'], resolve));
  memory.state = { ...clone(DEFAULT_STATE), ...(loaded.shieldState || {}) };
  const existingLists = clone(memory.state.remoteLists || []);
  memory.state.remoteLists = clone(DEFAULT_REMOTE_LISTS).concat(existingLists.filter(item => !DEFAULT_REMOTE_LISTS.find(base => base.id === item.id))).map(base => {
    const current = existingLists.find(item => item.id === base.id) || {};
    return { ...base, ...current };
  });
  memory.compiled = compileAllFilters(memory.state);
}

async function fetchList(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return await response.text();
}

async function updateRemoteLists() {
  let changed = false;
  for (const list of memory.state.remoteLists) {
    if (!list.enabled) continue;
    try {
      const text = await fetchList(list.url);
      if (text && text !== list.cachedText) {
        list.cachedText = text;
        list.updatedAt = Date.now();
        changed = true;
      }
      list.lastError = '';
    } catch (error) {
      list.lastError = String(error && error.message ? error.message : error);
    }
  }
  memory.state.lastUpdatedAt = Date.now();
  if (changed) memory.compiled = compileAllFilters(memory.state);
  await persistState();
  return changed;
}

function scheduleUpdates() {
  chrome.alarms.clearAll(() => {
    chrome.alarms.create('remoteListUpdate', {
      periodInMinutes: Math.max(60, Number(memory.state.updateIntervalHours || 24) * 60)
    });
  });
}

function getCosmeticSelectorsForHost(host) {
  const normalized = normalizeDomain(host);
  const selectors = new Set(memory.compiled.cosmeticGlobal);
  for (const domain of Object.keys(memory.compiled.cosmeticByDomain)) {
    if (domainMatches(normalized, domain)) {
      memory.compiled.cosmeticByDomain[domain].forEach(selector => selectors.add(selector));
    }
  }
  for (const domain of Object.keys(memory.compiled.cosmeticExceptionsByDomain)) {
    if (domainMatches(normalized, domain)) {
      memory.compiled.cosmeticExceptionsByDomain[domain].forEach(selector => selectors.delete(selector));
    }
  }
  const custom = memory.state.customCssSelectors[normalized] || [];
  custom.forEach(selector => selectors.add(selector));
  return Array.from(selectors);
}

function getScriptletPayloadForHost(host) {
  if (!memory.state.scriptletsEnabled) return [];
  const normalized = normalizeDomain(host);
  const payloads = [
    { name: 'overlay-buster' },
    { name: 'sticky-banner-buster' },
    { name: 'remove-inpage-popups' }
  ];
  for (const rule of memory.compiled.scriptletRules) {
    if (!rule.domains.length || rule.domains.some(domain => domainMatches(normalized, domain))) {
      payloads.push({ name: rule.name || 'custom', body: rule.body, raw: rule.raw });
    }
  }
  return payloads;
}

function getRequestMatch(details) {
  if (!memory.state.enabled) return null;
  const pageUrl = details.initiator || details.documentUrl || '';
  if (isPageAllowlisted(pageUrl)) return null;
  const request = {
    url: details.url,
    type: normalizeType(details.type),
    initiator: pageUrl,
    documentUrl: details.documentUrl || ''
  };
  for (const rule of memory.compiled.exceptionRules) {
    if (matchesRule(rule, request)) return null;
  }
  for (const rule of memory.compiled.networkRules) {
    if (matchesRule(rule, request)) return rule;
  }
  return null;
}

function isLikelyAdPopup(url) {
  const lower = String(url || '').toLowerCase();
  return /(ad|ads|advert|banner|popunder|onclick|trk|track|sponsor|taboola|outbrain|doubleclick|googlesyndication|affiliate|landing)/.test(lower);
}

function matchesPopupRule(targetUrl, openerUrl) {
  const request = { url: targetUrl, type: 'popup', initiator: openerUrl, documentUrl: openerUrl };
  for (const rule of memory.compiled.exceptionRules) {
    if (rule.options && rule.options.popup && matchesRule(rule, request)) return null;
  }
  for (const rule of memory.compiled.popupRules) {
    if (matchesRule(rule, request)) return rule;
  }
  for (const rule of memory.compiled.networkRules) {
    if (matchesRule(rule, request)) return rule;
  }
  return null;
}

function shouldBlockPopupCandidate(candidate) {
  if (!memory.state.enabled || !memory.state.popupBlockingEnabled) return { block: false };
  if (!candidate || !candidate.url || !candidate.openerUrl || !isRemoteTo(candidate.openerUrl, candidate.url)) return { block: false };
  if (isPageAllowlisted(candidate.openerUrl)) return { block: false };
  const matchedRule = matchesPopupRule(candidate.url, candidate.openerUrl);
  const adLike = isLikelyAdPopup(candidate.url);
  const hasOpener = !!candidate.openerTabId;
  if (matchedRule && hasOpener) {
    return { block: true, reason: matchedRule.raw };
  }
  if (adLike && hasOpener) {
    return { block: true, reason: 'heuristic-popup-ad' };
  }
  return { block: false };
}

function getPopupRequestVerdict(details) {
  if (!memory.state.enabled || !memory.state.popupBlockingEnabled) return null;
  if (!details || normalizeType(details.type) !== 'document') return null;
  if (typeof details.tabId !== 'number' || details.tabId < 0) return null;
  const openerUrl = details.initiator || details.documentUrl || '';
  if (!openerUrl || !isRemoteTo(openerUrl, details.url)) return null;
  if (isPageAllowlisted(openerUrl)) return null;
  const matchedRule = matchesPopupRule(details.url, openerUrl);
  if (matchedRule) return { block: true, reason: matchedRule.raw, openerUrl };
  if (isLikelyAdPopup(details.url)) return { block: true, reason: 'heuristic-popup-ad', openerUrl };
  return null;
}

chrome.webRequest.onBeforeRequest.addListener(details => {
  const popupVerdict = getPopupRequestVerdict(details);
  if (popupVerdict && popupVerdict.block) {
    chrome.tabs.remove(details.tabId);
    recordBlock({ tabId: details.tabId, url: details.url, type: 'popup', initiator: popupVerdict.openerUrl }, popupVerdict.reason, 'popup');
    persistState();
    return { cancel: true };
  }
  const matchedRule = getRequestMatch(details);
  if (!matchedRule) return { cancel: false };
  recordBlock(details, matchedRule.raw, 'request');
  persistState();
  return { cancel: true };
}, { urls: ['<all_urls>'] }, ['blocking']);

chrome.tabs.onCreated.addListener(tab => {
  if (!tab || !tab.id || !tab.openerTabId) return;
  memory.pendingPopupCandidates[tab.id] = {
    tabId: tab.id,
    openerTabId: tab.openerTabId,
    openerUrl: '',
    url: tab.pendingUrl || tab.url || '',
    createdAt: Date.now(),
    navTs: 0
  };
  chrome.tabs.get(tab.openerTabId, opener => {
    if (chrome.runtime.lastError || !opener) return;
    memory.pendingPopupCandidates[tab.id].openerUrl = opener.url || '';
    const verdict = shouldBlockPopupCandidate(memory.pendingPopupCandidates[tab.id]);
    if (verdict.block) {
      chrome.tabs.remove(tab.id);
      recordBlock({ tabId: tab.openerTabId, url: memory.pendingPopupCandidates[tab.id].url, type: 'popup', initiator: opener.url }, verdict.reason, 'popup');
      persistState();
      delete memory.pendingPopupCandidates[tab.id];
    }
  });
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(details => {
  memory.pendingPopupCandidates[details.tabId] = memory.pendingPopupCandidates[details.tabId] || {
    tabId: details.tabId,
    openerTabId: details.sourceTabId,
    openerUrl: details.sourceUrl || '',
    url: details.url || '',
    createdAt: Date.now(),
    navTs: Date.now()
  };
  Object.assign(memory.pendingPopupCandidates[details.tabId], {
    openerTabId: details.sourceTabId,
    openerUrl: details.sourceUrl || memory.pendingPopupCandidates[details.tabId].openerUrl || '',
    url: details.url || memory.pendingPopupCandidates[details.tabId].url || '',
    navTs: Date.now()
  });
  const verdict = shouldBlockPopupCandidate(memory.pendingPopupCandidates[details.tabId]);
  if (verdict.block) {
    chrome.tabs.remove(details.tabId);
    recordBlock({ tabId: details.sourceTabId, url: details.url, type: 'popup', initiator: details.sourceUrl }, verdict.reason, 'popup');
    persistState();
    delete memory.pendingPopupCandidates[details.tabId];
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    memory.tabNavigationMeta[tabId] = { url: changeInfo.url, ts: Date.now() };
    if (memory.pendingPopupCandidates[tabId]) {
      memory.pendingPopupCandidates[tabId].url = changeInfo.url;
      memory.pendingPopupCandidates[tabId].navTs = Date.now();
      const verdict = shouldBlockPopupCandidate(memory.pendingPopupCandidates[tabId]);
      if (verdict.block) {
        const openerTabId = memory.pendingPopupCandidates[tabId].openerTabId;
        chrome.tabs.remove(tabId);
        recordBlock({ tabId: openerTabId, url: changeInfo.url, type: 'popup', initiator: memory.pendingPopupCandidates[tabId].openerUrl }, verdict.reason, 'popup');
        persistState();
        delete memory.pendingPopupCandidates[tabId];
        return;
      }
    }
  }
  if (changeInfo.status === 'loading') updateBadge(tabId);
  if (changeInfo.status === 'complete' && tab && tab.url && !memory.tabStats[tabId]) updateBadge(tabId);
});

chrome.tabs.onRemoved.addListener(tabId => {
  delete memory.tabStats[tabId];
  delete memory.pickerTabs[tabId];
  delete memory.pendingPopupCandidates[tabId];
  delete memory.tabNavigationMeta[tabId];
});

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'remoteListUpdate') {
    await updateRemoteLists();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await loadState();
  scheduleUpdates();
  await updateRemoteLists();
  memory.ready = true;
});

chrome.runtime.onStartup.addListener(async () => {
  await loadState();
  scheduleUpdates();
  memory.ready = true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (!memory.ready) {
      await loadState();
      memory.ready = true;
    }
    const activeTab = sender && sender.tab ? sender.tab : null;

    if (message.type === 'GET_CONTENT_CONFIG') {
      const pageUrl = message.pageUrl || (activeTab && activeTab.url) || '';
      const host = getHostname(pageUrl);
      sendResponse({
        ok: true,
        data: {
          enabled: memory.state.enabled,
          allowlisted: isPageAllowlisted(pageUrl),
          cosmeticBlockingEnabled: memory.state.cosmeticBlockingEnabled,
          scriptletsEnabled: memory.state.scriptletsEnabled,
          selectors: getCosmeticSelectorsForHost(host),
          scriptlets: getScriptletPayloadForHost(host),
          pickerEnabled: !!memory.pickerTabs[(activeTab && activeTab.id) || -1]
        }
      });
      return;
    }

    if (message.type === 'GET_POPUP_DATA') {
      const tabId = Number(message.tabId);
      const stats = ensureTabStats(tabId);
      const tab = await new Promise(resolve => chrome.tabs.get(tabId, tabData => resolve(chrome.runtime.lastError ? null : tabData)));
      const pageUrl = (tab && tab.url) || '';
      sendResponse({
        ok: true,
        data: {
          enabled: memory.state.enabled,
          pageHost: getHostname(pageUrl),
          pageAllowed: isPageAllowlisted(pageUrl),
          lastUpdatedAt: memory.state.lastUpdatedAt,
          totals: memory.state.stats,
          tabStats: stats,
          pickerEnabled: !!memory.pickerTabs[tabId]
        }
      });
      return;
    }

    if (message.type === 'GET_OPTIONS_DATA') {
      sendResponse({
        ok: true,
        data: {
          enabled: memory.state.enabled,
          popupBlockingEnabled: memory.state.popupBlockingEnabled,
          cosmeticBlockingEnabled: memory.state.cosmeticBlockingEnabled,
          scriptletsEnabled: memory.state.scriptletsEnabled,
          updateIntervalHours: memory.state.updateIntervalHours,
          customFiltersText: memory.state.customFiltersText,
          customCssSelectors: memory.state.customCssSelectors,
          remoteLists: memory.state.remoteLists,
          lastUpdatedAt: memory.state.lastUpdatedAt
        }
      });
      return;
    }

    if (message.type === 'GET_LOGGER_DATA') {
      sendResponse({
        ok: true,
        data: {
          logger: memory.state.logger,
          totals: memory.state.stats,
          lastUpdatedAt: memory.state.lastUpdatedAt,
          ruleHits: memory.state.ruleHits,
          byTab: memory.tabStats
        }
      });
      return;
    }

    if (message.type === 'TOGGLE_ENABLED') {
      memory.state.enabled = !memory.state.enabled;
      await persistState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'TOGGLE_ALLOWLIST' && message.host) {
      const host = normalizeDomain(message.host);
      if (memory.state.allowlist.includes(host)) memory.state.allowlist = memory.state.allowlist.filter(item => item !== host);
      else memory.state.allowlist.push(host);
      await persistState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'SAVE_OPTIONS') {
      const payload = message.payload || {};
      memory.state.popupBlockingEnabled = !!payload.popupBlockingEnabled;
      memory.state.cosmeticBlockingEnabled = !!payload.cosmeticBlockingEnabled;
      memory.state.scriptletsEnabled = !!payload.scriptletsEnabled;
      memory.state.updateIntervalHours = Math.max(1, Number(payload.updateIntervalHours || 24));
      memory.state.customFiltersText = String(payload.customFiltersText || '');
      memory.state.customCssSelectors = payload.customCssSelectors || {};
      memory.state.remoteLists = (payload.remoteLists || []).map(item => ({
        id: item.id || ('custom_' + Math.random().toString(36).slice(2, 10)),
        name: item.name || item.url,
        enabled: item.enabled !== false,
        url: item.url,
        homepage: item.homepage || item.url,
        cachedText: item.cachedText || '',
        updatedAt: item.updatedAt || null,
        lastError: item.lastError || ''
      }));
      memory.compiled = compileAllFilters(memory.state);
      scheduleUpdates();
      await persistState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'RUN_LIST_UPDATE') {
      try {
        await updateRemoteLists();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      }
      return;
    }

    if (message.type === 'EXPORT_SETTINGS') {
      sendResponse({ ok: true, json: JSON.stringify(memory.state, null, 2) });
      return;
    }

    if (message.type === 'IMPORT_SETTINGS') {
      try {
        const imported = safeJsonParse(message.payload, null);
        if (!imported) throw new Error('Invalid JSON');
        memory.state = { ...clone(DEFAULT_STATE), ...imported };
        memory.compiled = compileAllFilters(memory.state);
        scheduleUpdates();
        await persistState();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error && error.message ? error.message : error) });
      }
      return;
    }

    if (message.type === 'CLEAR_LOGGER') {
      memory.state.logger = [];
      memory.state.ruleHits = {};
      Object.keys(memory.tabStats).forEach(tabId => {
        memory.tabStats[tabId].byRule = {};
        memory.tabStats[tabId].recent = [];
        memory.tabStats[tabId].byHost = {};
        memory.tabStats[tabId].blocked = 0;
        memory.tabStats[tabId].blockedPopups = 0;
        updateBadge(Number(tabId));
      });
      memory.state.stats = { blockedRequestsTotal: 0, blockedPopupsTotal: 0 };
      await persistState();
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'START_ELEMENT_PICKER') {
      const tabId = Number(message.tabId);
      memory.pickerTabs[tabId] = true;
      chrome.tabs.sendMessage(tabId, { type: 'ELEMENT_PICKER_MODE', enabled: true }, () => void chrome.runtime.lastError);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'CANCEL_ELEMENT_PICKER') {
      const tabId = Number(message.tabId);
      delete memory.pickerTabs[tabId];
      chrome.tabs.sendMessage(tabId, { type: 'ELEMENT_PICKER_MODE', enabled: false }, () => void chrome.runtime.lastError);
      sendResponse({ ok: true });
      return;
    }

    if (message.type === 'ELEMENT_PICKED') {
      const pageUrl = message.pageUrl || '';
      const host = getHostname(pageUrl);
      const selector = String(message.selector || '').trim();
      if (host && selector) {
        memory.state.customCssSelectors[host] = memory.state.customCssSelectors[host] || [];
        if (!memory.state.customCssSelectors[host].includes(selector)) {
          memory.state.customCssSelectors[host].push(selector);
        }
        delete memory.pickerTabs[(activeTab && activeTab.id) || -1];
        await persistState();
      }
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: 'Unknown message type' });
  })();
  return true;
});

(async function init() {
  await loadState();
  scheduleUpdates();
  memory.ready = true;
})();
