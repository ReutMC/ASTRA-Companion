/**
 * ASTRA desktop — native messaging bridge.
 * WebSocket server on 127.0.0.1 (ports 8765..8775) that the native messaging
 * host (spawned by the Chrome extension) connects to with a token:
 *   ws://127.0.0.1:<port>/?token=<token>
 * The {port, token} pair is written to userData/native/port.json on every
 * start. Exactly one browser client is allowed — the latest connection wins.
 * Envelope: { id, action, payload } → { id, ok, data | error }.
 */
import { WebSocketServer, WebSocket } from 'ws'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import { getNativeDir, getPortFile } from './config'
import type { ChromeBridge } from './types'

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

interface EnvelopeResponse {
  id?: number
  ok?: boolean
  data?: unknown
  error?: string
}

const PORT_RANGE_START = 8765
const PORT_RANGE_END = 8775

export class NativeBridge implements ChromeBridge {
  private wss: WebSocketServer | null = null
  private client: WebSocket | null = null
  private port = 0
  private token = ''
  private pending = new Map<number, PendingRequest>()
  private nextId = 1
  private notifyStatus: ((connected: boolean) => void) | null = null

  async start(onStatus: (connected: boolean) => void): Promise<void> {
    this.notifyStatus = onStatus
    this.token = crypto.randomBytes(16).toString('hex')

    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port += 1) {
      const ok = await this.tryListen(port)
      if (ok) {
        this.port = port
        break
      }
    }

    if (!this.wss) {
      console.error('[astra] native bridge could not bind any port 8765..8775')
      return
    }

    this.persistEndpoint()
    console.log(`[astra] native bridge listening on ws://127.0.0.1:${this.port}`)
  }

  private tryListen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false
      const wss = new WebSocketServer({ host: '127.0.0.1', port })
      wss.on('error', () => {
        if (!settled) {
          settled = true
          void wss.close()
          resolve(false)
        }
      })
      wss.on('listening', () => {
        if (settled) return
        settled = true
        this.wss = wss
        wss.on('connection', (ws, req) => this.handleConnection(ws, req))
        resolve(true)
      })
    })
  }

  private persistEndpoint(): void {
    try {
      fs.mkdirSync(getNativeDir(), { recursive: true })
      fs.writeFileSync(getPortFile(), JSON.stringify({ port: this.port, token: this.token }, null, 2), 'utf8')
    } catch (err) {
      console.error('[astra] failed to write native/port.json:', err)
    }
  }

  private handleConnection(ws: WebSocket, req: import('node:http').IncomingMessage): void {
    let token = ''
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      token = url.searchParams.get('token') ?? ''
    } catch {
      ws.close(4000, 'bad request')
      return
    }
    if (!this.token || token !== this.token) {
      ws.close(4001, 'unauthorized')
      return
    }

    // Latest connection wins; drop any previous browser client.
    if (this.client) {
      try {
        this.client.close(4002, 'replaced')
      } catch {
        // previous socket already gone
      }
    }
    this.client = ws
    this.notifyStatus?.(true)

    ws.on('message', (raw) => this.handleMessage(raw))
    ws.on('close', () => {
      if (this.client === ws) {
        this.client = null
        this.notifyStatus?.(false)
      }
    })
    ws.on('error', () => {
      // 'close' will follow; nothing else to do here.
    })
  }

  private handleMessage(raw: unknown): void {
    let msg: EnvelopeResponse
    try {
      msg = JSON.parse(String(raw)) as EnvelopeResponse
    } catch {
      return
    }
    if (typeof msg.id !== 'number') return
    const entry = this.pending.get(msg.id)
    if (!entry) return
    this.pending.delete(msg.id)
    clearTimeout(entry.timer)
    if (msg.ok) {
      entry.resolve(msg.data)
    } else {
      entry.reject(new Error(msg.error || 'Browser bridge request failed'))
    }
  }

  isConnected(): boolean {
    return this.client !== null && this.client.readyState === WebSocket.OPEN
  }

  request(action: string, payload?: unknown, timeoutMs = 15000): Promise<unknown> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Browser bridge is not connected'))
    }
    const id = this.nextId++
    const ws = this.client as WebSocket
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Browser bridge timeout after ${timeoutMs}ms: ${action}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        ws.send(JSON.stringify({ id, action, payload: payload ?? {} }), (err) => {
          if (err) {
            clearTimeout(timer)
            this.pending.delete(id)
            reject(err instanceof Error ? err : new Error(String(err)))
          }
        })
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  getPort(): number {
    return this.port
  }

  close(): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(new Error('Bridge shutting down'))
    }
    this.pending.clear()
    try {
      this.client?.close(1001, 'shutdown')
    } catch {
      // already closed
    }
    this.client = null
    try {
      this.wss?.close()
    } catch {
      // noop
    }
    this.wss = null
    this.notifyStatus?.(false)
  }
}
