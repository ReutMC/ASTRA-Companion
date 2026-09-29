/**
 * Tool registry tests — schema surface, permission gating, confirmation flow.
 */
import { describe, expect, it } from 'vitest'
import { createToolRegistry, describeConfirm } from '../agent/src/toolRegistry'
import { DEFAULT_SETTINGS } from '../agent/src/settings/defaults'
import type { Permission, ToolContext } from '../agent/src/types'

const ALL_TRUE: Record<Permission, boolean> = {
  MICROPHONE: true,
  BROWSER: true,
  FILES: true,
  WINDOWS_APPS: true,
  NETWORK: true,
  SCREEN_CAPTURE: true,
  CLIPBOARD: true,
}

const REQUIRED_TOOLS = [
  'web_search',
  'web_search_tavily',
  'read_page',
  'browser_context',
  'browser_elements',
  'browser_act',
  'browser_screenshot',
  'write_file',
  'list_astra_files',
  'open_app',
  'open_path',
  'create_folder',
  'show_downloads',
  'copy_to_clipboard',
  'remember',
  'recall',
]

function makeCtx(permissions: Record<Permission, boolean>): ToolContext {
  return {
    emit: () => {},
    confirm: async () => false,
    chrome: null,
    settings: { ...DEFAULT_SETTINGS, permissions },
    memory: { add: () => {}, search: () => [], all: () => [], clear: () => {} },
    homeDir: '/tmp/astra-test-home',
  }
}

describe('tool registry', () => {
  const registry = createToolRegistry()

  it('registers the full required tool set', () => {
    const names = registry.list().map((t) => t.name)
    for (const name of REQUIRED_TOOLS) expect(names).toContain(name)
  })

  it('exposes non-empty OpenAI-format schemas', () => {
    const schemas = registry.schemas()
    expect(schemas.length).toBeGreaterThanOrEqual(REQUIRED_TOOLS.length)
    for (const s of schemas) {
      expect(typeof s.name).toBe('string')
      expect(s.name.length).toBeGreaterThan(0)
      expect(typeof s.description).toBe('string')
      expect(typeof s.parameters).toBe('object')
    }
    const webSearch = schemas.find((s) => s.name === 'web_search')
    expect(webSearch).toBeDefined()
  })

  it('hasPermission mirrors the settings map', () => {
    expect(registry.hasPermission('web_search', ALL_TRUE)).toBe(true)
    expect(registry.hasPermission('web_search', { ...ALL_TRUE, NETWORK: false })).toBe(false)
    expect(registry.hasPermission('write_file', ALL_TRUE)).toBe(true)
    expect(registry.hasPermission('definitely_not_a_tool', ALL_TRUE)).toBe(false)
  })

  it('blocks tools whose permission is disabled', async () => {
    const res = await registry.run('web_search', { query: 'test' }, makeCtx({ ...ALL_TRUE, NETWORK: false }))
    expect(res.ok).toBe(false)
    expect(res.summary).toContain('Permission denied')
  })

  it('errors cleanly on unknown tools', async () => {
    const res = await registry.run('definitely_not_a_tool', {}, makeCtx(ALL_TRUE))
    expect(res.ok).toBe(false)
    expect(res.summary).toContain('definitely_not_a_tool')
  })

  it('asks for confirmation before write_file and honours denial', async () => {
    const res = await registry.run(
      'write_file',
      { folder: 'Research', filename: 'report.md', content: 'hello' },
      makeCtx(ALL_TRUE), // confirm() returns false
    )
    expect(res.ok).toBe(false)
    expect(res.summary).toContain('رد شد')
  })

  it('describeConfirm mentions the target filename for write_file', () => {
    const tool = registry.get('write_file')
    expect(tool).toBeDefined()
    const c = describeConfirm(tool!, { folder: 'Research', filename: 'report.md', content: 'hi' })
    expect(c.title).toContain('ذخیره فایل')
    expect(c.detail).toContain('report.md')
    expect(c.detail).toContain('Research')
  })
})
