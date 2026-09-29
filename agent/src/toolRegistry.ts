/**
 * Tool registry — permission gating, user confirmation, and error containment
 * for every ASTRA tool. All built-in tools are registered here.
 */
import type { AiToolSchema, ToolContext, ToolDef, ToolRegistry, ToolResult } from './types'
import { webSearch, webSearchTavily } from './tools/webSearch'
import { pageRead } from './tools/pageRead'
import { browserAct, browserContext, browserElements, browserScreenshot } from './tools/chrome'
import { listAstraFiles, writeFileTool } from './tools/filesystem'
import { createFolder, openApp, openPath, showDownloads } from './tools/windowsApps'
import { copyToClipboard } from './tools/clipboard'
import { recallTool, rememberTool } from './tools/memory'

function asRecord(args: unknown): Record<string, unknown> {
  return typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {}
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key]
  return typeof v === 'string' ? v : JSON.stringify(v ?? '')
}

/**
 * Builds a Persian-first confirmation dialog for a tool call.
 * Used by the registry whenever `tool.requiresConfirm` is set.
 */
export function describeConfirm(tool: ToolDef, args?: Record<string, unknown>): { title: string; detail: string } {
  const a = args ?? {}
  switch (tool.name) {
    case 'write_file':
      return {
        title: 'ذخیره فایل',
        detail: `ASTRA می‌خواهد فایل «${str(a, 'filename')}» را در پوشه ${str(a, 'folder')} ذخیره کند. اجازه می‌دهید؟ / ASTRA wants to save "${str(a, 'filename')}" in ${str(a, 'folder')}. Allow?`,
      }
    case 'browser_act':
      return {
        title: 'عمل در مرورگر',
        detail: `ASTRA می‌خواهد در مرورگر عملیات «${str(a, 'kind')}» انجام دهد. اجازه می‌دهید؟ / ASTRA wants to perform "${str(a, 'kind')}" in the browser. Allow?`,
      }
    case 'open_app':
      return {
        title: 'اجرای برنامه',
        detail: `ASTRA می‌خواهد برنامه «${str(a, 'app')}» را اجرا کند. اجازه می‌دهید؟ / ASTRA wants to launch "${str(a, 'app')}". Allow?`,
      }
    case 'open_path':
      return {
        title: 'باز کردن مسیر',
        detail: `ASTRA می‌خواهد «${str(a, 'path')}» را باز کند. اجازه می‌دهید؟ / ASTRA wants to open "${str(a, 'path')}". Allow?`,
      }
    case 'create_folder':
      return {
        title: 'ساخت پوشه',
        detail: `ASTRA می‌خواهد پوشه «${str(a, 'name')}» را بسازد. اجازه می‌دهید؟ / ASTRA wants to create the folder "${str(a, 'name')}". Allow?`,
      }
    case 'copy_to_clipboard': {
      const len = str(a, 'text').length
      return {
        title: 'کپی در کلیپ‌بورد',
        detail: `ASTRA می‌خواهد ${len} نویسه را در کلیپ‌بورد کپی کند. اجازه می‌دهید؟ / ASTRA wants to copy ${len} characters to the clipboard. Allow?`,
      }
    }
    default:
      return {
        title: 'تأیید عملیات',
        detail: `ASTRA می‌خواهد «${tool.name}» را اجرا کند: ${JSON.stringify(a).slice(0, 200)} / ASTRA wants to run "${tool.name}".`,
      }
  }
}

/**
 * Creates the tool registry with every built-in tool registered:
 * web_search, web_search_tavily, read_page, browser_context, browser_elements,
 * browser_act, browser_screenshot, write_file, list_astra_files, open_app,
 * open_path, create_folder, show_downloads, copy_to_clipboard, remember, recall.
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDef>()
  const register = (tool: ToolDef): void => {
    tools.set(tool.name, tool)
  }

  register(webSearch)
  register(webSearchTavily)
  register(pageRead)
  register(browserContext)
  register(browserElements)
  register(browserAct)
  register(browserScreenshot)
  register(writeFileTool)
  register(listAstraFiles)
  register(openApp)
  register(openPath)
  register(createFolder)
  register(showDownloads)
  register(copyToClipboard)
  register(rememberTool)
  register(recallTool)

  const registry: ToolRegistry = {
    register,

    list(): ToolDef[] {
      return [...tools.values()]
    },

    get(name: string): ToolDef | undefined {
      return tools.get(name)
    },

    schemas(): AiToolSchema[] {
      return [...tools.values()].map((t) => ({ name: t.name, description: t.description, parameters: t.parameters }))
    },

    hasPermission(name: string, permissions: Record<string, boolean>): boolean {
      const tool = tools.get(name)
      return !!tool && permissions[tool.permission] === true
    },

    async run(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult> {
      const tool = tools.get(name)
      if (!tool) {
        return { ok: false, summary: `ابزار ناشناخته / Unknown tool: ${name}` }
      }

      if (ctx.settings.permissions[tool.permission] !== true) {
        ctx.emit({
          type: 'activity',
          text: `اجازه لازم است: ${tool.permission} برای «${tool.name}» — در Settings → Permissions روشن کنید / Permission required: ${tool.permission}`,
        })
        return { ok: false, summary: `Permission denied: ${tool.permission}` }
      }

      if (tool.requiresConfirm) {
        const { title, detail } = describeConfirm(tool, asRecord(args))
        let approved = false
        try {
          approved = await ctx.confirm(title, detail)
        } catch {
          approved = false
        }
        if (!approved) {
          ctx.emit({ type: 'activity', text: 'تأیید نشد — عملیات رد شد / Not confirmed — the action was cancelled' })
          return { ok: false, summary: 'رد شد توسط کاربر / Cancelled by user' }
        }
      }

      try {
        // `args` comes straight from the model's JSON — the boundary `any` is intentional.
        return await tool.execute(args as any, ctx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { ok: false, summary: `خطا در اجرای «${tool.name}» / Tool error: ${msg}` }
      }
    },
  }

  return registry
}
