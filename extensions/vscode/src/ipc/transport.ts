import * as net from 'net';
import * as os from 'os';
import * as path from 'path';

export type MessageHandler = (msg: unknown) => void;

export interface IpcTransport {
  connect(): Promise<void>;
  send(msg: unknown): void;
  onMessage(handler: MessageHandler): void;
  disconnect(): void;
}

function getPipeName(): string {
  if (process.platform === 'win32') {
    return '\\\\.\\pipe\\coderelay-daemon';
  }
  return path.join(os.tmpdir(), 'coderelay-daemon.sock');
}

export class SocketTransport implements IpcTransport {
  private socket: net.Socket | null = null;
  private handlers: MessageHandler[] = [];
  private buffer = '';

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      sock.connect(getPipeName(), () => resolve());
      sock.on('error', reject);
      sock.on('data', (chunk) => {
        this.buffer += chunk.toString();
        const parts = this.buffer.split('\n');
        this.buffer = parts.pop() ?? '';
        for (const part of parts) {
          if (!part.trim()) continue;
          try {
            const parsed: unknown = JSON.parse(part);
            this.handlers.forEach(h => h(parsed));
          } catch {}
        }
      });
      this.socket = sock;
    });
  }

  send(msg: unknown): void {
    this.socket?.write(JSON.stringify(msg) + '\n');
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
  }
}
