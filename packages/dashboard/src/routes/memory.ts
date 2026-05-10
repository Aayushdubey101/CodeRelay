import { Router } from 'express';
import Database from 'better-sqlite3';

export function memoryRouter(ltDb: Database.Database, sessionDb: Database.Database): Router {
  const router = Router();

  router.get('/facts', (_req, res) => {
    const facts = ltDb.prepare(
      'SELECT id, text, ts, tags FROM facts ORDER BY ts DESC LIMIT 100'
    ).all() as Array<{ id: string; text: string; ts: number; tags: string }>;
    res.json({ facts });
  });

  router.get('/sessions', (_req, res) => {
    const sessions = sessionDb.prepare(
      'SELECT id, started_at, ended_at, summary FROM sessions ORDER BY started_at DESC LIMIT 20'
    ).all() as Array<{ id: string; started_at: number; ended_at: number | null; summary: string | null }>;
    res.json({ sessions });
  });

  return router;
}
