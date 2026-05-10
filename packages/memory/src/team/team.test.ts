import { describe, it, expect, afterEach } from 'vitest';
import { encrypt, decrypt, deriveKey } from './crypto.js';
import { TeamStore } from './teamStore.js';
import { TeamSyncer } from './syncer.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

const TMP = join(tmpdir(), 'cr-team-test-' + Date.now());
let store: TeamStore | null = null;

afterEach(() => {
  store?.close();
  store = null;
  try { rmSync(TMP, { recursive: true }); } catch {}
});

describe('crypto', () => {
  it('round-trips encrypt/decrypt', () => {
    const key = deriveKey('test-passphrase');
    const plaintext = 'Hello, Team!';
    const cipher = encrypt(plaintext, key);
    expect(cipher).not.toBe(plaintext);
    expect(decrypt(cipher, key)).toBe(plaintext);
  });

  it('different IVs produce different ciphertext', () => {
    const key = deriveKey('test-passphrase');
    const c1 = encrypt('same', key);
    const c2 = encrypt('same', key);
    expect(c1).not.toBe(c2);
    expect(decrypt(c1, key)).toBe('same');
    expect(decrypt(c2, key)).toBe('same');
  });

  it('wrong key throws', () => {
    const key = deriveKey('correct');
    const wrongKey = deriveKey('wrong');
    const cipher = encrypt('secret', key);
    expect(() => decrypt(cipher, wrongKey)).toThrow();
  });
});

describe('TeamStore', () => {
  it('writes and reads facts', async () => {
    store = new TeamStore(join(TMP, 'shared.db'), 'pass', 'alice');
    await store.write('fact one');
    await store.write('fact two');
    const facts = store.readAll();
    expect(facts).toHaveLength(2);
    expect(facts[0]?.content).toBe('fact one');
    expect(facts[0]?.author).toBe('alice');
  });

  it('deduplicates identical facts', async () => {
    store = new TeamStore(join(TMP, 'dedup.db'), 'pass', 'alice');
    await store.write('same fact');
    await store.write('same fact');
    const facts = store.readAll();
    expect(facts).toHaveLength(1);
  });

  it('stores encrypted bytes in DB', async () => {
    const dbPath = join(TMP, 'enc.db');
    store = new TeamStore(dbPath, 'pass', 'bob');
    await store.write('my secret fact');
    const rawDb = new (await import('better-sqlite3')).default(dbPath);
    const row = rawDb.prepare('SELECT content_enc FROM shared_facts LIMIT 1').get() as { content_enc: string };
    rawDb.close();
    expect(row.content_enc).not.toContain('my secret fact');
  });
});

describe('TeamSyncer', () => {
  it('syncs new facts to local writer', async () => {
    store = new TeamStore(join(TMP, 'sync.db'), 'pass', 'alice');
    await store.write('remote fact');

    const written: string[] = [];
    const syncer = new TeamSyncer(store, async (c) => { written.push(c); }, 60000);
    await syncer.sync();
    expect(written).toContain('remote fact');
  });

  it('does not re-sync old facts', async () => {
    store = new TeamStore(join(TMP, 'resync.db'), 'pass', 'alice');
    await store.write('old fact');

    const written: string[] = [];
    const syncer = new TeamSyncer(store, async (c) => { written.push(c); }, 60000);
    await syncer.sync();
    await syncer.sync();
    expect(written).toHaveLength(1);
  });
});
