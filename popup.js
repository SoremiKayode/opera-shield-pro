function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}
function queryActiveTab() {
  return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0])));
}
function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleString() : 'Never';
}
function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function makeRow(title, value, hint) {
  const div = document.createElement('div');
  div.className = 'item-row';
  div.innerHTML = `<div class="item-main"><strong>${escapeHtml(title)}</strong>${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}</div><span>${escapeHtml(String(value))}</span>`;
  return div;
}
async function refresh() {
  const tab = await queryActiveTab();
  const response = await send({ type: 'GET_POPUP_DATA', tabId: tab && tab.id ? tab.id : -1 });
  const data = response.data;
  document.getElementById('enabledToggle').checked = data.enabled;
  document.getElementById('enabledStatus').textContent = data.enabled ? 'Enabled' : 'Disabled';
  document.getElementById('blockedTotal').textContent = data.totals.blockedRequestsTotal || 0;
  document.getElementById('blockedPopups').textContent = data.totals.blockedPopupsTotal || 0;
  document.getElementById('pageHost').textContent = data.pageHost || '-';
  document.getElementById('lastUpdated').textContent = fmtTime(data.lastUpdatedAt);
  document.getElementById('allowlistBtn').textContent = data.pageAllowed ? 'Remove allowlist' : 'Allowlist site';
  document.getElementById('pickElement').textContent = data.pickerEnabled ? 'Picking… click page element' : 'Pick element';

  const hostList = document.getElementById('byHostList');
  hostList.innerHTML = '';
  const byHost = Object.entries(data.tabStats.byHost || {}).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!byHost.length) hostList.innerHTML = '<div class="empty">No blocked ad domains on this tab yet.</div>';
  else byHost.forEach(([host, count]) => hostList.appendChild(makeRow(host, count, 'blocked requests')));

  const ruleList = document.getElementById('ruleList');
  ruleList.innerHTML = '';
  const byRule = Object.entries(data.tabStats.byRule || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (!byRule.length) ruleList.innerHTML = '<div class="empty">No rule hits on this tab yet.</div>';
  else byRule.forEach(([rule, count]) => ruleList.appendChild(makeRow(rule, count, 'rule hits')));

  const recentList = document.getElementById('recentList');
  recentList.innerHTML = '';
  const recent = (data.tabStats.recent || []).slice(0, 8);
  if (!recent.length) recentList.innerHTML = '<div class="empty">Nothing blocked on this tab yet.</div>';
  else recent.forEach(item => recentList.appendChild(makeRow(item.host || item.type, item.type, item.url)));
}

document.getElementById('enabledToggle').addEventListener('change', async () => {
  await send({ type: 'TOGGLE_ENABLED' });
  refresh();
});

document.getElementById('allowlistBtn').addEventListener('click', async () => {
  const tab = await queryActiveTab();
  const host = new URL(tab.url).hostname;
  await send({ type: 'TOGGLE_ALLOWLIST', host });
  refresh();
});

document.getElementById('pickElement').addEventListener('click', async () => {
  const tab = await queryActiveTab();
  await send({ type: 'START_ELEMENT_PICKER', tabId: tab.id });
  window.close();
});

document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
document.getElementById('openLogger').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('logger.html') }));
refresh();
