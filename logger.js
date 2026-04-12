function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}
function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleString() : '';
}
function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
let cache = [];
let ruleHits = {};
function render(logs) {
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const filtered = !query ? logs : logs.filter(item => JSON.stringify(item).toLowerCase().includes(query));
  const tbody = document.getElementById('logBody');
  tbody.innerHTML = filtered.map(item => `
    <tr>
      <td>${escapeHtml(fmtTime(item.ts))}</td>
      <td>${escapeHtml(item.tabId)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.type)}</td>
      <td>${escapeHtml(item.host)}</td>
      <td class="url-cell" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</td>
      <td class="url-cell" title="${escapeHtml(item.reason)}">${escapeHtml(item.reason)}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="empty">No blocked items yet.</td></tr>';

  const hostCounts = {};
  filtered.forEach(item => { if (item.host) hostCounts[item.host] = (hostCounts[item.host] || 0) + 1; });
  const hostSummary = document.getElementById('hostSummary');
  const hostItems = Object.entries(hostCounts).sort((a, b) => b[1] - a[1]).slice(0, 25);
  hostSummary.innerHTML = hostItems.map(([host, count]) => `<div class="item-row"><div class="item-main"><strong>${escapeHtml(host)}</strong><div class="hint">blocked host</div></div><span>${count}</span></div>`).join('') || '<div class="empty">No blocked hosts yet.</div>';

  const ruleSummary = document.getElementById('ruleSummary');
  const ruleItems = Object.entries(ruleHits).sort((a, b) => b[1] - a[1]).slice(0, 25);
  ruleSummary.innerHTML = ruleItems.map(([rule, count]) => `<div class="item-row"><div class="item-main"><strong>${escapeHtml(rule)}</strong><div class="hint">rule hits</div></div><span>${count}</span></div>`).join('') || '<div class="empty">No rules have matched yet.</div>';
}
async function refresh() {
  const response = await send({ type: 'GET_LOGGER_DATA' });
  cache = response.data.logger || [];
  ruleHits = response.data.ruleHits || {};
  document.getElementById('requestsMetric').textContent = response.data.totals.blockedRequestsTotal || 0;
  document.getElementById('popupsMetric').textContent = response.data.totals.blockedPopupsTotal || 0;
  document.getElementById('listsMetric').textContent = response.data.lastUpdatedAt ? new Date(response.data.lastUpdatedAt).toLocaleString() : 'Never';
  render(cache);
}
document.getElementById('refreshBtn').addEventListener('click', refresh);
document.getElementById('clearBtn').addEventListener('click', async () => { await send({ type: 'CLEAR_LOGGER' }); refresh(); });
document.getElementById('searchInput').addEventListener('input', () => render(cache));
document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
refresh();
