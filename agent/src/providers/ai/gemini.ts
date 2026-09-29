/**
 * Google Gemini provider (v1beta `generateContent`).
 * Converts the OpenAI-style message list to Gemini's contents/parts format and
 * sanitizes JSON Schemas (Gemini rejects `$schema`, `additionalProperties`, plain-`null` types…).
 */
import { randomUUID } from 'node:crypto'
import type { AiMessage, AiToolCall, AiToolSchema, AIProvider, ChatOptions, ChatResponse } from '../../types'
import { describeHttpError, networkErrorMessage, safeErrorBody } from './http'

interface GeminiPart {
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown> }
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

type SchemaNode = Record<string, unknown>

const STRIPPED_KEYS = new Set(['$schema', '$id', '$ref', 'additionalProperties', 'default', 'examples'])

/**
 * Walks a JSON Schema and removes keywords Gemini rejects.
 * - `$schema`, `additionalProperties`, `$id`, `$ref`, `default`, `examples` are dropped.
 * - `type: [..., 'null']` unions lose the `'null'` member and get `nullable: true`.
 * - a bare `type: 'null'` becomes `type: 'string'` + `nullable: true`.
 */
export function sanitizeGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(sanitizeGeminiSchema)
  if (typeof node !== 'object' || node === null) return node
  const src = node as SchemaNode
  const out: SchemaNode = {}
  for (const [key, value] of Object.entries(src)) {
    if (STRIPPED_KEYS.has(key)) continue
    out[key] = sanitizeGeminiSchema(value)
  }
  const t = out['type']
  if (Array.isArray(t)) {
    if (t.includes('null')) {
      const rest = t.filter((x) => x !== 'null')
      out['nullable'] = true
      out['type'] = rest.length === 1 ? rest[0] : rest
    }
  } else if (t === 'null') {
    out['type'] = 'string'
    out['nullable'] = true
  }
  return out
}

/** Sanitizes a tool parameter schema and guarantees a `type: 'object'` root with `properties`. */
export function dereferenceNullable(parameters: object): SchemaNode {
  const cleaned = sanitizeGeminiSchema(parameters)
  if (cleaned !== null && typeof cleaned === 'object' && !Array.isArray(cleaned)) {
    const out = cleaned as SchemaNode
    if (out['type'] === undefined) out['type'] = 'object'
    if (out['properties'] === undefined) out['properties'] = {}
    return out
  }
  return { type: 'object', properties: {} }
}

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini'

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: AiMessage[], tools: AiToolSchema[], opts?: ChatOptions): Promise<ChatResponse> {
    const model = this.model.replace(/^models\//, '')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`

    const contents: { role: 'user' | 'model'; parts: GeminiPart[] }[] = []
    let systemText = ''
    for (const m of messages) {
      if (m.role === 'system') {
        systemText = systemText ? `${systemText}\n\n${m.content ?? ''}` : m.content ?? ''
        continue
      }
      if (m.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.content ?? '' }] })
        continue
      }
      if (m.role === 'assistant') {
        const parts: GeminiPart[] = []
        if (m.content) parts.push({ text: m.content })
        for (const tc of m.tool_calls ?? []) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>
          } catch {
            args = {}
          }
          parts.push({ functionCall: { name: tc.function.name, args } })
        }
        if (parts.length > 0) contents.push({ role: 'model', parts })
        continue
      }
      // role === 'tool'
      contents.push({ role: 'user', parts: [{ text: `Tool result for ${m.name ?? 'tool'}: ${m.content ?? ''}` }] })
    }

    const body: Record<string, unknown> = { contents }
    if (systemText) body['systemInstruction'] = { parts: [{ text: systemText }] }
    if (tools.length > 0) {
      body['tools'] = [
        {
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: dereferenceNullable(t.parameters),
          })),
        },
      ]
    }
    body['generationConfig'] = {
      temperature: opts?.temperature ?? 0.4,
      maxOutputTokens: opts?.maxTokens ?? 2048,
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: opts?.signal,
      })
    } catch (err) {
      throw networkErrorMessage(err)
    }
    if (!res.ok) {
      throw describeHttpError(res.status, await safeErrorBody(res))
    }

    const json = (await res.json()) as GeminiResponse
    const candidate = json.candidates?.[0]
    const parts = candidate?.content?.parts ?? []
    let content = ''
    const toolCalls: AiToolCall[] = []
    for (const part of parts) {
      if (typeof part.text === 'string' && part.text.length > 0) content += part.text
      if (part.functionCall?.name) {
        toolCalls.push({
          id: `call_${randomUUID()}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        })
      }
    }
    if (!candidate && json.promptFeedback?.blockReason) {
      throw new Error(
        `درخواست توسط فیلتر ایمنی Gemini مسدود شد (${json.promptFeedback.blockReason}) / Request blocked by Gemini safety filter (${json.promptFeedback.blockReason})`,
      )
    }
    return { content: content.length > 0 ? content : null, toolCalls }
  }
}
