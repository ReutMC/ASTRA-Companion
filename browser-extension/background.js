// ASTRA Browser Bridge - background service worker
// Bridges the ASTRA desktop app (via Chrome Native Messaging) to page content scripts.
/* global chrome */

const HOST_NAME = 'com.astra.browser_bridge';
let nativePort = null;
let nextId = 1;
const pending = new Map();

function connect() {
  if (nativePort) return;
  try {
    nativePort = chrome.runtime.connectNative(HOST_NAME);
    nativePort.onMessage.addListener(onHostMessage);
    nativePort.onDisconnect.addListener(() => {
      nativePort = null;
      setTimeout(connect, 4000);
    });
  } catch (e) {
    nativePort = null;
    setTimeout(connect, 6000);
  }
}

function onHostMessage(msg) {
  if (!msg) return;
  if (msg.type === 'req' && typeof msg.id === 'number') {
    // Request from the ASTRA desktop app -> dispatch into the browser
    (async () => {
      const data = await dispatch(msg.action, msg.payload || {});
      if (nativePort) {
        try {
          nativePort.postMessage({
            id: msg.id,
            type: 'res',
            ok: !data.error,
            data: data.error ? undefined : data,
            error: data.error
          });
        } catch (e) { /* ignore */ }
      }
    })();
    return;
  }
  if (msg.type === 'res' && typeof msg.id === 'number' && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.type === 'event' && msg.event === 'state') {
    try {
      chrome.action.setBadgeText({ text: msg.state && msg.state !== 'SLEEPING' && msg.state !== 'IDLE' ? '•' : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#38bdf8' });
    } catch (e) { /* ignore */ }
  }
}

function hostRequest(action, payload, timeoutMs = 20000) {
  return new Promise((resolve) => {
    if (!nativePort) {
      resolve({ ok: false, error: 'Chrome connection unavailable.' });
      return;
    }
    const id = nextId++;
    pending.set(id, resolve);
    try {
      nativePort.postMessage({ id, type: 'req', action, payload });
    } catch (e) {
      pending.delete(id);
      resolve({ ok: false, error: 'Bridge write failed. Is ASTRA running?' });
      return;
    }
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        resolve({ ok: false, error: 'Bridge timeout. Is ASTRA running?' });
      }
    }, timeoutMs);
  });
}

async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

async function tabAction(payload) {
  let tab = await activeTab();
  if (!tab || !tab.id) return { ok: false, error: 'No active tab.' };
  try {
    return await chrome.tabs.sendMessage(tab.id, payload);
  } catch (e) {
    // content script not injected yet - inject and retry once
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      return await chrome.tabs.sendMessage(tab.id, payload);
    } catch (e2) {
      return { ok: false, error: 'Content script unavailable on this page (restricted page?).' };
    }
  }
}

async function navigate(url, newTab) {
  try {
    let tab;
    if (newTab) {
      tab = await chrome.tabs.create({ url });
    } else {
      tab = await activeTab();
      if (!tab || !tab.id) tab = await chrome.tabs.create({ url });
      else tab = await chrome.tabs.update(tab.id, { url });
    }
    // wait for load (max 8s)
    await new Promise((resolve) => {
      const to = setTimeout(resolve, 8000);
      try {
        const listener = (tabId, info) => {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            clearTimeout(to);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      } catch (e) {
        clearTimeout(to);
        resolve();
      }
    });
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg && msg.type === 'status') {
      const r = await hostRequest('ping', {}, 6000);
      sendResponse({ connected: !!nativePort && r.ok !== false, detail: r });
      return;
    }
    sendResponse({ ok: false, error: 'Unknown request' });
  })();
  return true;
});

// Map ASTRA tool actions to browser capabilities
async function dispatch(action, payload) {
  switch (action) {
    case 'ping':
      return { ok: true, app: 'ASTRA', version: '1.0.0' };
    case 'navigate':
      return navigate(String(payload.url || ''), payload.newTab === true);
    case 'elements':
      return tabAction({ action: 'elements', max: Number(payload.max || 70) });
    case 'find':
      return tabAction({ action: 'find', text: String(payload.text || ''), max: Number(payload.max || 20) });
    case 'click':
      return tabAction({ action: 'click', elementId: payload.elementId, text: payload.text });
    case 'type':
      return tabAction({ action: 'type', elementId: payload.elementId, text: payload.text, submit: payload.submit === true });
    case 'extract':
      return tabAction({ action: 'extract' });
    case 'scroll':
      return tabAction({ action: 'scroll', direction: payload.direction, amount: payload.amount });
    case 'cursor':
      return tabAction({ action: 'cursor', elementId: payload.elementId, text: payload.text, label: payload.label });
    default:
      return { ok: false, error: 'Unknown action: ' + action };
  }
}

function onHostRequest(msg) {
  (async () => {
    if (!msg || msg.type !== 'req') return;
    const data = await dispatch(msg.action, msg.payload || {});
    if (nativePort) {
      try {
        nativePort.postMessage({ id: msg.id, type: 'res', ok: !data.error, data: data.error ? undefined : data, error: data.error });
      } catch (e) { /* ignore */ }
    }
  })();
}

connect();
chrome.runtime.onInstalled.addListener(connect);
chrome.runtime.onStartup.addListener(connect);
try {
  chrome.alarms.create('keepalive', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === 'keepalive' && !nativePort) connect();
  });
} catch (e) { /* ignore */ }
