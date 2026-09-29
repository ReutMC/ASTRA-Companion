import { store } from '../store';
import type { AISettings } from '../../shared/types';

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOpts {
  maxTokens?: number;
  temperature?: number;
}

export function providerDefaults(p: AISettings['provider']): string {
  switch (p) {
    case 'openai-compatible':
      return 'https://api.openai.com/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'openrouter':
      return 'https://openrouter.ai/api/v1';
    case 'gemini':
      return 'https://generativelanguage.googleapis.com/v1beta';
  }
}

function baseUrl(ai: AISettings): string {
  return (ai.baseUrl || providerDefaults(ai.provider)).replace(/\/+$/, '');
}

export async function aiChat(messages: ChatMsg[], opts?: ChatOpts): Promise<string> {
  const ai = store.settings.ai;
  const key = store.getCred('aiApiKey');
  if (!key) throw new Error('No API key configured. Open Settings > AI and save your API key.');
  const temperature = opts?.temperature ?? ai.temperature ?? 0.4;
  const maxTokens = opts?.maxTokens ?? 1600;

  let res: globalThis.Response;
  if (ai.provider === 'gemini') {
    const sys = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
    const contents = messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    res = await fetch(`${baseUrl(ai)}/models/${encodeURIComponent(ai.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents,
        systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
        generationConfig: { temperature, maxOutputTokens: maxTokens }
      })
    });
  } else {
    res = await fetch(`${baseUrl(ai)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: ai.model, messages, temperature, max_tokens: maxTokens })
    });
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI request failed (HTTP ${res.status}). Check provider/model/API key in Settings > AI. ${t.slice(0, 180)}`);
  }
  const j = (await res.json()) as Record<string, any>;
  const text =
    ai.provider === 'gemini'
      ? ((j?.candidates?.[0]?.content?.parts || []) as any[]).map((p) => p?.text || '').join('')
      : (j?.choices?.[0]?.message?.content ?? '');
  if (!text) throw new Error('AI returned an empty response.');
  return String(text);
}

export async function transcribeAudio(dataB64: string, mime = 'audio/webm'): Promise<string> {
  const ai = store.settings.ai;
  const key = store.getCred('aiApiKey');
  if (!key) throw new Error('No API key configured for speech recognition.');
  if (ai.provider === 'gemini') {
    throw new Error('Speech-to-text requires an OpenAI-compatible endpoint (OpenAI / Groq / OpenRouter).');
  }
  const buf = Buffer.from(dataB64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(buf)], { type: mime }), 'audio.webm');
  form.append('model', ai.sttModel || 'whisper-1');
  const res = await fetch(`${baseUrl(ai)}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form
  });
  if (!res.ok) throw new Error(`Speech recognition failed (HTTP ${res.status}).`);
  const j = (await res.json()) as Record<string, any>;
  return String(j?.text || '').trim();
}

export async function speakText(text: string): Promise<string | null> {
  const ai = store.settings.ai;
  const key = store.getCred('aiApiKey');
  if (!key || ai.provider === 'gemini') return null;
  const res = await fetch(`${baseUrl(ai)}/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'tts-1',
      voice: store.settings.voice.ttsVoice || 'alloy',
      input: text.slice(0, 3000),
      response_format: 'mp3'
    })
  });
  if (!res.ok) return null;
  const ab = await res.arrayBuffer();
  return Buffer.from(ab).toString('base64');
}

export async function aiTest(): Promise<string> {
  const t = await aiChat([{ role: 'user', content: 'Reply with exactly: ASTRA OK' }], { maxTokens: 16, temperature: 0 });
  return t.trim().slice(0, 80);
}
