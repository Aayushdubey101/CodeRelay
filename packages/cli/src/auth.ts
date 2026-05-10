import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const CREDENTIALS_PATH = join(homedir(), '.coderelay', 'credentials.json');
const SALT = 'coderelay-auth-salt-v1';
const ALG = 'aes-256-gcm' as const;

export type ProviderName = 'anthropic' | 'openai' | 'gemini' | 'openrouter' | 'ollama';

interface EncryptedEntry {
  iv: string;
  tag: string;
  ciphertext: string;
  validatedAt: string;
}

type CredentialStore = Partial<Record<ProviderName, EncryptedEntry>>;

function deriveKey(passphrase: string): Buffer {
  return scryptSync(passphrase, SALT, 32) as Buffer;
}

export function saveCredential(provider: ProviderName, apiKey: string, passphrase: string): void {
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  mkdirSync(join(homedir(), '.coderelay'), { recursive: true });

  let store: CredentialStore = {};
  if (existsSync(CREDENTIALS_PATH)) {
    try { store = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as CredentialStore; } catch { /* ignore */ }
  }

  store[provider] = {
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    ciphertext: ciphertext.toString('hex'),
    validatedAt: new Date().toISOString(),
  };

  writeFileSync(CREDENTIALS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function loadCredential(provider: ProviderName, passphrase: string): string | null {
  if (!existsSync(CREDENTIALS_PATH)) return null;

  let store: CredentialStore;
  try { store = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as CredentialStore; }
  catch { return null; }

  const entry = store[provider];
  if (!entry) return null;

  try {
    const key = deriveKey(passphrase);
    const decipher = createDecipheriv(ALG, key, Buffer.from(entry.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(entry.tag, 'hex'));
    const plain = Buffer.concat([decipher.update(Buffer.from(entry.ciphertext, 'hex')), decipher.final()]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

export function clearCredential(provider: ProviderName): void {
  if (!existsSync(CREDENTIALS_PATH)) return;
  let store: CredentialStore = {};
  try { store = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as CredentialStore; } catch { return; }
  delete store[provider];
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(store, null, 2), 'utf8');
}

export function listSavedProviders(): ProviderName[] {
  if (!existsSync(CREDENTIALS_PATH)) return [];
  try {
    const store = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8')) as CredentialStore;
    return Object.keys(store) as ProviderName[];
  } catch { return []; }
}

/** Format-validate an API key for the given provider. Returns error message or null if valid. */
export function validateKeyFormat(provider: ProviderName, value: string): string | null {
  if (provider === 'anthropic' && !value.startsWith('sk-ant-')) return 'Anthropic keys start with sk-ant-';
  if (provider === 'openai' && !value.startsWith('sk-')) return 'OpenAI keys start with sk-';
  if (provider === 'gemini' && !value.startsWith('AIza')) return 'Gemini keys start with AIza';
  if (provider === 'openrouter' && !value.startsWith('sk-or-')) return 'OpenRouter keys start with sk-or-';
  if (value.length < 8) return 'Key too short';
  return null;
}

/** Test if a key actually works by making a minimal real API call. */
export async function testCredential(provider: ProviderName, apiKey: string, ollamaHost = 'localhost:11434'): Promise<{ ok: boolean; detail: string }> {
  try {
    if (provider === 'anthropic') {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
        signal: AbortSignal.timeout(10000),
      });
      if (resp.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
      if (resp.status === 400) return { ok: true, detail: 'Key valid (400 = model/param issue, not auth)' };
      return { ok: resp.ok, detail: `HTTP ${resp.status}` };
    }

    if (provider === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
      return { ok: resp.ok, detail: `HTTP ${resp.status}` };
    }

    if (provider === 'gemini') {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (resp.status === 400 || resp.status === 403) return { ok: false, detail: `Auth failed (${resp.status})` };
      return { ok: resp.ok, detail: `HTTP ${resp.status}` };
    }

    if (provider === 'openrouter') {
      const resp = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.status === 401) return { ok: false, detail: 'Invalid API key (401)' };
      return { ok: resp.ok, detail: `HTTP ${resp.status}` };
    }

    if (provider === 'ollama') {
      const resp = await fetch(`http://${ollamaHost}/api/tags`, { signal: AbortSignal.timeout(5000) });
      return { ok: resp.ok, detail: resp.ok ? 'Ollama running' : `HTTP ${resp.status}` };
    }

    return { ok: false, detail: 'Unknown provider' };
  } catch (err) {
    return { ok: false, detail: String(err) };
  }
}

const PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'];

type ConfigureResult = 'saved' | 'skipped' | 'failed';

async function configureProvider(
  rl: readline.Interface,
  provider: ProviderName,
  passphrase: string,
): Promise<ConfigureResult> {
  if (provider === 'ollama') {
    const host = (await rl.question(`  Ollama host [localhost:11434]: `)).trim() || 'localhost:11434';
    const test = await testCredential('ollama', '', host);
    if (test.ok) {
      console.log(`  ✓ Ollama reachable at ${host}`);
      return 'saved';
    }
    console.log(`  ○ Ollama not reachable: ${test.detail} (configure manually)`);
    return 'skipped';
  }

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const apiKey = (await rl.question(`  API key for ${provider}: `)).trim();
    if (!apiKey) { console.log('  Skipped.'); return 'skipped'; }

    const fmtErr = validateKeyFormat(provider, apiKey);
    if (fmtErr !== null) {
      console.log(`  Format error: ${fmtErr}`);
      if (attempt < maxAttempts) continue;
      return 'failed';
    }

    process.stdout.write(`  Testing key... `);
    const test = await testCredential(provider, apiKey);
    if (test.ok) {
      saveCredential(provider, apiKey, passphrase);
      console.log(`✓ Valid — saved.`);
      return 'saved';
    }

    console.log(`✗ ${test.detail}`);
    if (attempt < maxAttempts) {
      const retry = (await rl.question(`  Retry? [Y/n]: `)).trim().toLowerCase();
      if (retry === 'n') return 'failed';
    }
  }
  return 'failed';
}

export async function runAuth(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\nCodeRelay Auth — Configure Provider Credentials\n');

    const saved = listSavedProviders();
    if (saved.length > 0) {
      console.log(`Already configured: ${saved.join(', ')}`);
      const reconfigure = (await rl.question('Reconfigure? [y/N]: ')).trim().toLowerCase();
      if (reconfigure !== 'y' && reconfigure !== 'yes') {
        console.log('\nNo changes made.\n');
        return;
      }
    }

    console.log('Providers: (1) Anthropic  (2) OpenAI  (3) Gemini  (4) OpenRouter  (5) Ollama  (6) All  (7) Exit');
    const choice = (await rl.question('Select: ')).trim();

    let selected: ProviderName[];
    if (choice === '7' || choice.toLowerCase() === 'exit') {
      console.log('Exiting.\n'); return;
    } else if (choice === '6' || choice.toLowerCase() === 'all') {
      selected = [...PROVIDERS];
    } else if (choice === '1') { selected = ['anthropic']; }
    else if (choice === '2') { selected = ['openai']; }
    else if (choice === '3') { selected = ['gemini']; }
    else if (choice === '4') { selected = ['openrouter']; }
    else if (choice === '5') { selected = ['ollama']; }
    else { console.error(`Invalid choice: ${choice}`); return; }

    let passphrase = '';
    const nonOllama = selected.filter(p => p !== 'ollama');
    if (nonOllama.length > 0) {
      passphrase = (await rl.question('Encryption passphrase (remember this): ')).trim();
      if (!passphrase) { console.error('Empty passphrase — aborting.'); return; }
    }

    const results: Array<{ provider: ProviderName; result: ConfigureResult }> = [];

    for (const provider of selected) {
      console.log(`\n${provider.charAt(0).toUpperCase() + provider.slice(1)}:`);
      const result = await configureProvider(rl, provider, passphrase);
      results.push({ provider, result });
    }

    console.log('\n' + '─'.repeat(50));
    console.log('Provider'.padEnd(16) + 'Status');
    console.log('─'.repeat(50));
    for (const { provider, result } of results) {
      const icon = result === 'saved' ? '✓' : result === 'skipped' ? '○' : '✗';
      console.log(`  ${icon}  ${provider.padEnd(14)} ${result}`);
    }
    console.log('─'.repeat(50));

    console.log('\nRun coderelay init inside your project directory to start.\n');
  } finally {
    rl.close();
  }
}
