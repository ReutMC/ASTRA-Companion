import { toolRegistry } from './index';
import { store } from '../store';
import { bridgeRequest, bridgeConnected } from '../browser/bridge';

async function breq(action: string, payload: unknown): Promise<unknown> {
  if (!bridgeConnected()) {
    throw new Error(
      'Chrome connection unavailable. Open Chrome with the ASTRA extension installed and its ID registered in ASTRA Settings > Browser, then try again.'
    );
  }
  return bridgeRequest(action, payload);
}

async function maybeCursor(args: { elementId?: unknown; text?: unknown; label?: unknown }): Promise<void> {
  if (!store.settings.browser.aiCursor) return;
  try {
    await breq('cursor', { elementId: args.elementId, text: args.text, label: args.label || 'ASTRA' });
  } catch {
    // cursor is decorative - never fail the action because of it
  }
}

export function registerBrowserTools(r: typeof toolRegistry): void {
  r.register({
    name: 'browser_navigate',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Navigate the active Chrome tab to a URL (or open a new tab with newTab=true).',
    args: '{ "url": "https://youtube.com", "newTab": false }',
    describe: (a) => `Navigating Chrome to ${String(a.url || '')}`,
    run: (a) => breq('navigate', { url: String(a.url || ''), newTab: a.newTab === true })
  });

  r.register({
    name: 'browser_elements',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'List visible interactive elements on the active Chrome tab (ELEMENT_ID, ROLE, TEXT, ARIA_LABEL, X, Y, WIDTH, HEIGHT).',
    args: '{}',
    describe: () => 'Reading interactive elements on the page',
    run: () => breq('elements', { max: 70 })
  });

  r.register({
    name: 'browser_find',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Find elements on the page whose text/aria/placeholder contains the given text. Returns ELEMENT_IDs and coordinates.',
    args: '{ "text": "search" }',
    describe: (a) => `Looking for "${String(a.text || '').slice(0, 50)}" on the page`,
    run: (a) => breq('find', { text: String(a.text || ''), max: 20 })
  });

  r.register({
    name: 'browser_click',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Click an element by ELEMENT_ID (from browser_elements/browser_find) or by visible text.',
    args: '{ "elementId": "e12" } or { "text": "Sign in" }',
    describe: (a) => `Clicking ${a.elementId ? `element ${String(a.elementId)}` : `"${String(a.text || '').slice(0, 40)}"`}`,
    run: async (a) => {
      await maybeCursor(a);
      return breq('click', { elementId: a.elementId, text: a.text });
    }
  });

  r.register({
    name: 'browser_type',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Type text into an input/textarea/contenteditable (by ELEMENT_ID or found by text). Set submit=true to press Enter afterwards.',
    args: '{ "text": "Minecraft Live", "elementId": "e5", "submit": true }',
    describe: (a) => `Typing "${String(a.text || '').slice(0, 40)}"${a.submit === true ? ' and pressing Enter' : ''}`,
    run: async (a) => {
      await maybeCursor(a);
      return breq('type', { elementId: a.elementId, text: String(a.text ?? ''), submit: a.submit === true });
    }
  });

  r.register({
    name: 'browser_extract',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Extract the page title, URL, visible text and interactive elements from the active tab.',
    args: '{}',
    describe: () => 'Extracting page content',
    run: () => breq('extract', {})
  });

  r.register({
    name: 'browser_scroll',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Scroll the active tab up or down.',
    args: '{ "direction": "down|up", "amount": 800 }',
    describe: () => 'Scrolling the page',
    run: (a) => breq('scroll', { direction: a.direction === 'up' ? 'up' : 'down', amount: Number(a.amount || 800) })
  });

  r.register({
    name: 'ai_cursor_move',
    permission: 'BROWSER',
    state: 'WORKING',
    description: 'Move the futuristic blue AI cursor (visual only) to an element found by ELEMENT_ID or text, with a highlight pulse.',
    args: '{ "elementId": "e3" } or { "text": "YouTube search box" }',
    describe: (a) => `Moving the AI cursor to ${a.elementId ? String(a.elementId) : `"${String(a.text || '').slice(0, 40)}"`}`,
    run: (a) => breq('cursor', { elementId: a.elementId, text: a.text, label: 'ASTRA' })
  });
}
