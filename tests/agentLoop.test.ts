/**
 * End-to-end agent-loop test against a local mock OpenAI-compatible server.
 * Verifies: tool round-trip → final answer → sources event → done event,
 * the tool result reaching the model, the busy guard, and local memory writes.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as http from 'node:http'
import * as fs from 'node:fs'
import { createAgentRuntime } from '../agent/src/agent'
import { DEFAULT_SETTINGS } from '../agent/src/settings/defaults'
import type { AgentEvent, Settings } from '../agent/src/types'

const bodies: { messages: { role: string; tool_call_id?: string }[] }[] = []

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', (c) => (raw += c))
  req.on('end', () => {
    const body = JSON.parse(raw)
    bodies.push(body)
    res.setHeader('Content-Type', 'application/json')
    if (bodies.length === 1) {
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call_test_1',
                    type: 'function',
                    function: { name: 'remember', arguments: JSON.stringify({ text: 'likes green tea' }) },
                  },
                ],
              },
            },
          ],
        }),
      )
    } else {
      res.end(
        JSON.stringify({
          choices: [{ message: { content: 'Done. See [Tea](https://example.com/tea).' } }],
        }),
      )
    }
  })
})

const ready = new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
const UD = '/tmp/astra-loop-userdata'

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  fs.rmSync(UD, { recursive: true, force: true })
})

function makeSettings(): Settings {
  const port = (server.address() as { port: number }).port
  return {
    ...DEFAULT_SETTINGS,
    ai: { ...DEFAULT_SETTINGS.ai, endpoint: `http://127.0.0.1:${port}`, apiKey: 'test-key', model: 'test-model' },
    memory: { enabled: true },
  }
}

describe('agent runtime end-to-end (mock provider)', () => {
  it('runs a tool round then a final answer with sources and a done event', async () => {
    await ready
    const events: AgentEvent[] = []
    const runtime = createAgentRuntime({
      settings: makeSettings(),
      chromeBridge: { connected: () => false, request: async () => ({}) },
      emit: (e) => events.push(e),
      confirm: async () => false,
      homeDir: '/tmp/astra-loop-home',
      userDataDir: UD,
    })

    await runtime.submit('please remember that I like green tea')

    const types = events.map((e) => e.type)
    expect(types).toContain('tool')
    expect(types).toContain('message')
    expect(types).toContain('sources')
    expect(types).toContain('done')

    const toolEvt = events.find((e) => e.type === 'tool' && e.resultSummary !== undefined)
    expect(toolEvt && toolEvt.type === 'tool' && toolEvt.ok).toBe(true)
    expect(toolEvt && toolEvt.type === 'tool' && toolEvt.resultSummary).toContain('ذخیره شد در حافظه محلی')

    const msg = events.find((e) => e.type === 'message')
    expect(msg && msg.type === 'message' && msg.content).toContain('Done')

    const src = events.find((e) => e.type === 'sources')
    expect(src && src.type === 'sources' && src.sources[0]?.url).toBe('https://example.com/tea')

    // The tool result was fed back to the model as a tool message.
    expect(bodies.length).toBe(2)
    expect(bodies[1].messages.some((m) => m.role === 'tool' && m.tool_call_id === 'call_test_1')).toBe(true)

    // Memory persisted the user text + the remembered note.
    const memoryFile = JSON.parse(fs.readFileSync(`${UD}/memory.json`, 'utf8')) as { text: string }[]
    expect(memoryFile.some((m) => m.text === 'please remember that I like green tea')).toBe(true)
    expect(memoryFile.some((m) => m.text === 'likes green tea')).toBe(true)
  })

  it('rejects concurrent submits with a friendly busy event', async () => {
    await ready
    const events: AgentEvent[] = []
    const runtime = createAgentRuntime({
      settings: makeSettings(),
      chromeBridge: { connected: () => false, request: async () => ({}) },
      emit: (e) => events.push(e),
      confirm: async () => false,
      homeDir: '/tmp/astra-loop-home',
      userDataDir: UD,
    })
    const first = runtime.submit('one')
    const second = runtime.submit('two') // must hit the busy guard
    await Promise.all([first, second])
    const busyError = events.find((e) => e.type === 'error' && e.message.includes('در حال کار است'))
    expect(busyError).toBeDefined()
  })

  it('surfaces a clean error for a missing API key', async () => {
    await ready
    const events: AgentEvent[] = []
    const settings = { ...makeSettings(), ai: { ...makeSettings().ai, apiKey: '' } }
    const runtime = createAgentRuntime({
      settings,
      chromeBridge: { connected: () => false, request: async () => ({}) },
      emit: (e) => events.push(e),
      confirm: async () => false,
      homeDir: '/tmp/astra-loop-home',
      userDataDir: UD,
    })
    await runtime.submit('hi')
    const err = events.find((e) => e.type === 'error')
    expect(err && err.type === 'error' && err.message).toContain('no API key configured')
    expect(events.some((e) => e.type === 'done')).toBe(true)
  })
})
