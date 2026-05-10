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

const PROVIDERS: ProviderName[] = ['anthropic', 'openai', 'gemini', 'openrouter', 'ollama'];

export async function runAuth(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  try {
    console.log('\nCodeRelay Auth — Configure Provider Credentials\n');
    console.log('Providers: ' + PROVIDERS.join(', '));
    const providerInput = (await rl.question('Provider: ')).trim().toLowerCase();

    if (!(PROVIDERS as string[]).includes(providerInput)) {
      console.error(`Unknown provider: ${providerInput}`);
      return;
    }

    const provider = providerInput as ProviderName;

    if (provider === 'ollama') {
      console.log('Ollama runs locally — no API key needed. Make sure ollama is running on http://localhost:11434');
      return;
    }

    const apiKey = (await rl.question(`API key for ${provider}: `)).trim();
    if (!apiKey) { console.error('Empty API key — aborting.'); return; }

    const passphrase = (await rl.question('Encryption passphrase (remember this): ')).trim();
    if (!passphrase) { console.error('Empty passphrase — aborting.'); return; }

    saveCredential(provider, apiKey, passphrase);
    console.log(`\nSaved encrypted credential for ${provider} to ${CREDENTIALS_PATH}\n`);
    console.log(`Set env var: export ${provider.toUpperCase()}_API_KEY=$(coderelay auth show ${provider})`);
  } finally {
    rl.close();
  }
}
