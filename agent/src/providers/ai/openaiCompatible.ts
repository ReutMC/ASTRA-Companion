/**
 * OpenAI-compatible chat provider — covers OpenAI, Groq, OpenRouter and any custom baseURL
 * that implements `POST {endpoint}/chat/completions`.
 */
import { randomUUID } from 'node:crypto'
import type { AiMessage, AiToolCall, AiToolSchema, AIProvider, ChatOptions, ChatResponse } from '../../types'
import { describeHttpError, networkErrorMessage, safeErrorBody } from './http'

interface WireToolCall {
  id?: string
  type?: string
  function?: { name?: string; arguments?: string | Record<string, unknown> }
}

interface WireResponse {
  choices?: { message?: { content?: string | null; tool_calls?: WireToolCall[] } }[]
}

function normalizeToolCall(tc: WireToolCall, index: number): AiToolCall {
  const fn = tc.function ?? {}
  const rawArgs = fn.arguments
  return {
    id: typeof tc.id === 'string' && tc.id ? tc.id : `call_${randomUUID()}`,
    type: 'function',
    function: {
      name: typeof fn.name === 'string' ? fn.name : `tool_${index}`,
      arguments:
        typeof rawArgs === 'string' ? rawArgs : rawArgs === undefined ? '{}' : JSON.stringify(rawArgs),
    },
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = 'openai-compatible'

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: AiMessage[], tools: AiToolSchema[], opts?: ChatOptions): Promise<ChatResponse> {
    const url = `${this.endpoint.replace(/\/+$/, '')}/chat/completions`
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 2048,
    }
    if (tools.length > 0) {
      body['tools'] = tools.map((s) => ({ type: 'function', function: s }))
      body['tool_choice'] = 'auto'
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: opts?.signal,
      })
    } catch (err) {
      throw networkErrorMessage(err)
    }
    if (!res.ok) {
      throw describeHttpError(res.status, await safeErrorBody(res))
    }

    const json = (await res.json()) as WireResponse
    const message = json.choices?.[0]?.message
    return {
      content: typeof message?.content === 'string' ? message.content : null,
      toolCalls: (message?.tool_calls ?? []).map(normalizeToolCall),
    }
  }
}
