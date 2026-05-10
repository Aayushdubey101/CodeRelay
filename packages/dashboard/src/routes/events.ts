import { Router } from 'express';
import { watch, existsSync } from 'node:fs';
import { setupSse } from '../sse.js';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

export function eventsRouter(actionLogPath: string): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const send = setupSse(res);
    send({ type: 'connected' });

    if (!existsSync(actionLogPath)) return;

    const watcher = watch(actionLogPath, async () => {
      const last = await tailLastLine(actionLogPath);
      if (last) send({ type: 'action', data: last });
    });

    req.on('close', () => watcher.close());
  });

  return router;
}

async function tailLastLine(path: string): Promise<Record<string, unknown> | null> {
  const lines: string[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  const last = lines[lines.length - 1];
  if (!last) return null;
  try { return JSON.parse(last) as Record<string, unknown>; } catch { return null; }
}
