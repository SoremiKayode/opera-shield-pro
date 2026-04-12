function send(message) {
  return new Promise(resolve => chrome.runtime.sendMessage(message, resolve));
}
function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleString() : 'Never';
}
function escapeHtml(text) {
  return String(text || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function makeListRow(item) {
  const row = document.createElement('div');
  row.className = 'item-row';
  row.innerHTML = `
    <div class="item-main">
      <label class="check"><input type="checkbox" data-id="${escapeHtml(item.id)}" ${item.enabled ? 'checked' : ''} /> <span><strong>${escapeHtml(item.name)}</strong></span></label>
      <div class="hint">${escapeHtml(item.url)}</div>
      <div class="hint">Updated: ${escapeHtml(fmtTime(item.updatedAt))}${item.lastError ? ' · Last error: ' + escapeHtml(item.lastError) : ''}</div>
    </div>
    <button class="secondary remove-list" data-id="${escapeHtml(item.id)}">Remove</button>
  `;
  return row;
}
function collectRemoteLists() {
  return Array.from(document.querySelectorAll('#remoteLists .item-row')).map(row => {
    const checkbox = row.querySelector('input[type="checkbox"]');
    const hints = row.querySelectorAll('.hint');
    return {
      id: checkbox.dataset.id,
      name: row.querySelector('strong').textContent,
      url: hints[0].textContent,
      enabled: checkbox.checked
    };
  });
}
async function load() {
  const response = await send({ type: 'GET_OPTIONS_DATA' });
  const data = response.data;
  document.getElementById('popupBlockingEnabled').checked = data.popupBlockingEnabled;
  document.getElementById('cosmeticBlockingEnabled').checked = data.cosmeticBlockingEnabled;
  document.getElementById('scriptletsEnabled').checked = data.scriptletsEnabled;
  document.getElementById('updateIntervalHours').value = data.updateIntervalHours;
  document.getElementById('customFiltersText').value = data.customFiltersText || '';
  document.getElementById('customCssSelectors').value = JSON.stringify(data.customCssSelectors || {}, null, 2);
  const remoteLists = document.getElementById('remoteLists');
  remoteLists.innerHTML = '';
  data.remoteLists.forEach(item => remoteLists.appendChild(makeListRow(item)));
}
async function save() {
  const payload = {
    popupBlockingEnabled: document.getElementById('popupBlockingEnabled').checked,
    cosmeticBlockingEnabled: document.getElementById('cosmeticBlockingEnabled').checked,
    scriptletsEnabled: document.getElementById('scriptletsEnabled').checked,
    updateIntervalHours: document.getElementById('updateIntervalHours').value,
    customFiltersText: document.getElementById('customFiltersText').value,
    customCssSelectors: JSON.parse(document.getElementById('customCssSelectors').value || '{}'),
    remoteLists: collectRemoteLists()
  };
  return send({ type: 'SAVE_OPTIONS', payload });
}

document.getElementById('saveButton').addEventListener('click', async () => {
  const status = document.getElementById('saveStatus');
  try {
    await save();
    status.textContent = 'Saved.';
  } catch (error) {
    status.textContent = error.message || 'Could not save settings.';
  }
});

document.getElementById('runUpdateNow').addEventListener('click', async () => {
  const el = document.getElementById('updateStatus');
  el.textContent = 'Updating...';
  const response = await send({ type: 'RUN_LIST_UPDATE' });
  el.textContent = response.ok ? 'Lists updated.' : 'Update failed.';
  load();
});

document.getElementById('addRemoteList').addEventListener('click', () => {
  const name = document.getElementById('newListName').value.trim();
  const url = document.getElementById('newListUrl').value.trim();
  if (!url) return;
  const list = document.getElementById('remoteLists');
  list.appendChild(makeListRow({
    id: 'custom_' + Math.random().toString(36).slice(2, 10),
    name: name || url,
    url,
    enabled: true,
    updatedAt: null,
    lastError: ''
  }));
  document.getElementById('newListName').value = '';
  document.getElementById('newListUrl').value = '';
});

document.getElementById('remoteLists').addEventListener('click', event => {
  const button = event.target.closest('.remove-list');
  if (!button) return;
  button.closest('.item-row').remove();
});

document.getElementById('exportSettings').addEventListener('click', async () => {
  const response = await send({ type: 'EXPORT_SETTINGS' });
  document.getElementById('importExportBox').value = response.json;
});

document.getElementById('importSettings').addEventListener('click', async () => {
  const response = await send({ type: 'IMPORT_SETTINGS', payload: document.getElementById('importExportBox').value });
  document.getElementById('saveStatus').textContent = response.ok ? 'Imported.' : response.error;
  if (response.ok) load();
});

document.getElementById('openLogger').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('logger.html') }));
load();
