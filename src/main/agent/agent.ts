import { aiChat, speakText } from '../providers/ai';
import type { ChatMsg } from '../providers/ai';
import { toolRegistry } from '../tools';
import { store } from '../store';
import { setState, activity, emitEvent, getState } from '../state';
import { hasPermission } from '../permissions';
import { buildSystemPrompt } from './prompt';

let busy = false;
let aborted = false;

export function agentAbort(): void {
  aborted = true;
}

export function isBusy(): boolean {
  return busy;
}

function extractJson(raw: string): Record<string, any> | null {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function friendly(e: unknown): string {
  return String((e as Error)?.message || e);
}

export async function runAgent(userText: string): Promise<void> {
  busy = true;
  aborted = false;
  try {
    setState('THINKING');
    activity('Understanding your request...');

    const maxSteps = Math.min(Math.max(store.settings.ai.maxSteps || 8, 3), 16);
    const msgs: ChatMsg[] = [{ role: 'system', content: buildSystemPrompt() }];
    for (const h of store.recentHistory(12)) {
      msgs.push({ role: h.role, content: h.content });
    }
    msgs.push({ role: 'user', content: userText });

    let final: string | null = null;

    for (let step = 0; step < maxSteps; step++) {
      if (aborted) {
        activity('Stopped by user.');
        setState('IDLE');
        return;
      }

      const raw = await aiChat(msgs);
      const plan = extractJson(raw);

      if (!plan) {
        msgs.push({ role: 'assistant', content: raw.slice(0, 600) });
        msgs.push({ role: 'user', content: 'Your last reply was not valid JSON. Reply again with STRICT JSON only.' });
        continue;
      }

      if (typeof plan.answer === 'string' && plan.answer.trim()) {
        final = plan.answer.trim();
        break;
      }

      const act = plan.action;
      if (!act || typeof act.tool !== 'string') {
        msgs.push({ role: 'assistant', content: raw.slice(0, 600) });
        msgs.push({
          role: 'user',
          content: 'OBSERVATION: your JSON had no "action" and no "answer". Reply with {"thought":"...","action":{"tool":"...","args":{...}}} or {"thought":"...","answer":"..."}'
        });
        continue;
      }

      const tool = toolRegistry.get(act.tool);
      if (!tool) {
        msgs.push({ role: 'assistant', content: raw.slice(0, 600) });
        msgs.push({
          role: 'user',
          content: `OBSERVATION: unknown tool "${act.tool}". Available tools: ${toolRegistry.names().join(', ')}`
        });
        continue;
      }

      if (!hasPermission(tool.permission)) {
        msgs.push({ role: 'assistant', content: raw.slice(0, 600) });
        msgs.push({
          role: 'user',
          content: `OBSERVATION: permission ${tool.permission} is disabled. Ask the user to enable it in Settings > Permissions, or finish without it.`
        });
        continue;
      }

      setState(tool.state || 'WORKING');
      activity(tool.describe(act.args || {}));

      let obs: unknown;
      try {
        obs = await tool.run(act.args || {});
      } catch (e) {
        obs = { error: friendly(e) };
      }

      msgs.push({ role: 'assistant', content: raw.length > 1200 ? raw.slice(0, 1200) : raw });
      msgs.push({ role: 'user', content: `OBSERVATION (${act.tool}): ${JSON.stringify(obs).slice(0, 5000)}` });
    }

    if (!final) {
      final =
        'I could not complete this task within the step limit. Try a more specific request. / نتوانستم این کار را در محدودیت گام‌ها کامل کنم؛ لطفاً درخواست را مشخص‌تر کن.';
    }

    store.pushHistory('user', userText);
    store.pushHistory('assistant', final);
    if (store.settings.memory.enabled && store.settings.memory.storeConversations) {
      store.addConversation(userText, final);
    }

    setState('SPEAKING');
    let audioB64: string | undefined;
    if (store.settings.voice.ttsProvider === 'openai' && !aborted) {
      try {
        const b = await speakText(final.slice(0, 1500));
        if (b) audioB64 = 'data:audio/mpeg;base64,' + b;
      } catch {
        audioB64 = undefined;
      }
    }

    emitEvent({ type: 'chat:assistant', text: final, audioB64 });
    emitEvent({ type: 'research:answer', text: final });
    activity('Done.');
    setState('SUCCESS');
    setTimeout(() => {
      if (getState() === 'SUCCESS') setState('IDLE');
    }, 2600);
  } finally {
    busy = false;
  }
}
