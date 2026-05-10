import { Router } from 'express';
import Database from 'better-sqlite3';

export function graphRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    const files = db.prepare('SELECT id, path, lang FROM files LIMIT 500').all() as Array<{ id: number; path: string; lang: string }>;
    const edges = db.prepare('SELECT src, dst, kind FROM edges LIMIT 2000').all() as Array<{ src: number; dst: number; kind: string }>;
    res.json({ nodes: files, edges });
  });

  router.get('/symbol/:id', (req, res) => {
    const sym = db.prepare(
      'SELECT s.*, f.path AS filePath FROM symbols s JOIN files f ON s.file_id = f.id WHERE s.id = ?'
    ).get(req.params['id']) as Record<string, unknown> | undefined;
    if (!sym) { res.status(404).json({ error: 'not found' }); return; }
    res.json(sym);
  });

  router.get('/stats', (_req, res) => {
    const fileCount = (db.prepare('SELECT COUNT(*) AS n FROM files').get() as { n: number }).n;
    const symCount = (db.prepare('SELECT COUNT(*) AS n FROM symbols').get() as { n: number }).n;
    const edgeCount = (db.prepare('SELECT COUNT(*) AS n FROM edges').get() as { n: number }).n;
    res.json({ files: fileCount, symbols: symCount, edges: edgeCount });
  });

  return router;
}
