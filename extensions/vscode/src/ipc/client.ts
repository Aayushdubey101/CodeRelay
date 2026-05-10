import type { IpcTransport } from './transport.js';

export interface RpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export class DaemonClient {
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private nextId = 1;
  private connected = false;

  constructor(private readonly transport: IpcTransport) {
    transport.onMessage((msg) => {
      const res = msg as RpcResponse;
      const handler = this.pending.get(res.id);
      if (!handler) return;
      this.pending.delete(res.id);
      if (res.error) handler.reject(new Error(res.error.message));
      else handler.resolve(res.result);
    });
  }

  async connect(): Promise<void> {
    await this.transport.connect();
    this.connected = true;
  }

  async call<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.connected) await this.connect();
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      const req: RpcRequest = { jsonrpc: '2.0', id, method, params };
      this.transport.send(req);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }
      }, 5000);
    });
  }

  disconnect(): void {
    this.transport.disconnect();
    this.connected = false;
  }
}
