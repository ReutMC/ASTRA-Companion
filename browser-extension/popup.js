/* global chrome, document, navigator */
const statusEl = document.getElementById('status');
document.getElementById('ext-id').textContent = chrome.runtime.id;

document.getElementById('copy').addEventListener('click', () => {
  navigator.clipboard.writeText(chrome.runtime.id).then(() => {
    const b = document.getElementById('copy');
    b.textContent = 'Copied';
    setTimeout(() => (b.textContent = 'Copy'), 1400);
  });
});

const cb = document.getElementById('ai-cursor');
chrome.storage.local.get('aiCursorEnabled', (r) => {
  cb.checked = r.aiCursorEnabled !== false;
});
cb.addEventListener('change', () => {
  chrome.storage.local.set({ aiCursorEnabled: cb.checked });
});

chrome.runtime.sendMessage({ type: 'status' }, (res) => {
  if (res && res.connected) {
    statusEl.textContent = 'CONNECTED';
    statusEl.classList.remove('off');
    statusEl.classList.add('on');
  } else {
    statusEl.textContent = 'NOT RUNNING';
    statusEl.classList.remove('on');
    statusEl.classList.add('off');
  }
});
