import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { createLogger } from '@coderelay/core';

const log = createLogger('@coderelay/daemon');

function getPipeName(): string {
  if (process.platform === 'win32') return '\\\\.\\pipe\\coderelay-daemon';
  return path.join(os.tmpdir(), 'coderelay-daemon.sock');
}

interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

type RpcHandler = (params: unknown) => unknown | Promise<unknown>;

export class DaemonServer {
  private server: net.Server;
  private handlers = new Map<string, RpcHandler>();

  constructor() {
    this.server = net.createServer(socket => this.handleSocket(socket));
    this.register('getStatus', () => ({ status: 'idle', ts: Date.now() }));
    this.register('getPlan', () => []);
    this.register('getContextManifest', () => []);
  }

  register(method: string, handler: RpcHandler): void {
    this.handlers.set(method, handler);
  }

  start(): void {
    const pipe = getPipeName();
    this.server.listen(pipe, () => {
      log.info({ pipe }, 'Daemon listening');
    });
  }

  stop(): void {
    this.server.close();
  }

  private handleSocket(socket: net.Socket): void {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.trim()) continue;
        void this.dispatch(part, socket);
      }
    });
  }

  private async dispatch(raw: string, socket: net.Socket): Promise<void> {
    let req: RpcRequest;
    try { req = JSON.parse(raw) as RpcRequest; } catch {
      socket.write(JSON.stringify({ jsonrpc: '2.0', id: 0, error: { code: -32700, message: 'Parse error' } }) + '\n');
      return;
    }

    const handler = this.handlers.get(req.method);
    if (!handler) {
      socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: 'Method not found' } }) + '\n');
      return;
    }

    try {
      const result = await handler(req.params);
      socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }) + '\n');
    } catch (err) {
      socket.write(JSON.stringify({ jsonrpc: '2.0', id: req.id, error: { code: -32000, message: String(err) } }) + '\n');
    }
  }
}
