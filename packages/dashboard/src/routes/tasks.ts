import { Router } from 'express';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';

export function tasksRouter(actionLogPath: string): Router {
  const router = Router();

  router.get('/', async (_req, res) => {
    const tasks = await readLog(actionLogPath, 200);
    res.json({ tasks });
  });

  router.get('/:id', async (req, res) => {
    const all = await readLog(actionLogPath, 1000);
    const taskEntries = all.filter(e => e['taskId'] === req.params['id']);
    if (!taskEntries.length) { res.status(404).json({ error: 'not found' }); return; }
    res.json({ taskId: req.params['id'], entries: taskEntries });
  });

  return router;
}

async function readLog(path: string, limit: number): Promise<Record<string, unknown>[]> {
  if (!existsSync(path)) return [];
  const lines: Record<string, unknown>[] = [];
  const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { lines.push(JSON.parse(line) as Record<string, unknown>); } catch {}
  }
  return lines.slice(-limit);
}
