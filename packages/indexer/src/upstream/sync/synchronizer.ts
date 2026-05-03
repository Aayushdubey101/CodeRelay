/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as os from 'os';
import { MerkleDAG } from './merkle.js';

export class FileSynchronizer {
  private fileHashes: Map<string, string>;
  private merkleDAG: MerkleDAG;
  private rootDir: string;
  private snapshotPath: string;
  private ignorePatterns: string[];
  private supportedExtensions: string[];

  constructor(rootDir: string, ignorePatterns: string[] = [], supportedExtensions: string[] = []) {
    this.rootDir = rootDir;
    this.snapshotPath = FileSynchronizer.getSnapshotPath(rootDir);
    this.fileHashes = new Map();
    this.merkleDAG = new MerkleDAG();
    this.ignorePatterns = ignorePatterns;
    this.supportedExtensions = supportedExtensions;
  }

  private static getSnapshotPath(codebasePath: string): string {
    const homeDir = os.homedir();
    const merkleDir = path.join(homeDir, '.coderelay', 'merkle');
    const normalizedPath = path.resolve(codebasePath);
    const hash = crypto.createHash('md5').update(normalizedPath).digest('hex');
    return path.join(merkleDir, `${hash}.json`);
  }

  private async hashFile(filePath: string): Promise<string> {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      throw new Error(`Attempted to hash a directory: ${filePath}`);
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private async generateFileHashes(dir: string): Promise<Map<string, string>> {
    const fileHashes = new Map<string, string>();

    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[Synchronizer] Cannot read directory ${dir}: ${msg}`);
      return fileHashes;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(this.rootDir, fullPath);

      if (this.shouldIgnore(relativePath)) continue;

      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[Synchronizer] Cannot stat ${fullPath}: ${msg}`);
        continue;
      }

      if (stat.isDirectory()) {
        if (!this.shouldIgnore(relativePath)) {
          const subHashes = await this.generateFileHashes(fullPath);
          for (const [p, h] of subHashes.entries()) {
            fileHashes.set(p, h);
          }
        }
      } else if (stat.isFile()) {
        if (!this.shouldIgnore(relativePath)) {
          const ext = path.extname(entry.name);
          if (this.supportedExtensions.length > 0 && !this.supportedExtensions.includes(ext)) {
            continue;
          }
          try {
            const hash = await this.hashFile(fullPath);
            fileHashes.set(relativePath, hash);
          } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.warn(`[Synchronizer] Cannot hash file ${fullPath}: ${msg}`);
          }
        }
      }
    }
    return fileHashes;
  }

  private shouldIgnore(relativePath: string): boolean {
    const pathParts = relativePath.split(path.sep);
    if (pathParts.some((part) => part.startsWith('.'))) return true;

    if (this.ignorePatterns.length === 0) return false;

    const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    if (!normalizedPath) return false;

    for (const pattern of this.ignorePatterns) {
      if (this.matchPattern(normalizedPath, pattern)) return true;
    }

    const parts = normalizedPath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const partial = parts.slice(0, i + 1).join('/');
      for (const pattern of this.ignorePatterns) {
        if (this.matchPattern(partial, pattern)) return true;
      }
    }

    return false;
  }

  private matchPattern(filePath: string, pattern: string): boolean {
    const cleanPath = filePath.replace(/^\/+|\/+$/g, '');
    const normalizedPattern = pattern.replace(/\\/g, '/');
    const cleanPattern = normalizedPattern.replace(/^\/+|\/+$/g, '');
    const isRootAnchored = normalizedPattern.startsWith('/');
    const isDirectoryPattern = normalizedPattern.endsWith('/');

    if (!cleanPath || !cleanPattern) return false;

    if (isDirectoryPattern) {
      if (isRootAnchored) {
        return this.simpleGlobMatch(cleanPath, cleanPattern) || cleanPath.startsWith(`${cleanPattern}/`);
      }
      return this.matchesDirectoryPattern(cleanPath, cleanPattern);
    }

    if (isRootAnchored) return this.simpleGlobMatch(cleanPath, cleanPattern);

    if (cleanPattern.includes('/')) return this.simpleGlobMatch(cleanPath, cleanPattern);

    const fileName = path.basename(cleanPath);
    return this.simpleGlobMatch(fileName, cleanPattern);
  }

  private matchesDirectoryPattern(filePath: string, dirPattern: string): boolean {
    const pathParts = filePath.split('/');
    const dirPartCount = dirPattern.split('/').length;

    for (let i = 0; i <= pathParts.length - dirPartCount; i++) {
      const candidate = pathParts.slice(i, i + dirPartCount).join('/');
      if (this.simpleGlobMatch(candidate, dirPattern)) return true;
    }
    return false;
  }

  private simpleGlobMatch(text: string, pattern: string): boolean {
    if (!text || !pattern) return false;
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexPattern}$`).test(text);
  }

  private buildMerkleDAG(fileHashes: Map<string, string>): MerkleDAG {
    const dag = new MerkleDAG();
    const keys = Array.from(fileHashes.keys());
    const sortedPaths = [...keys].sort();

    let valuesString = '';
    for (const key of keys) {
      valuesString += fileHashes.get(key) ?? '';
    }
    const rootNodeId = dag.addNode('root:' + valuesString);

    for (const p of sortedPaths) {
      dag.addNode(p + ':' + (fileHashes.get(p) ?? ''), rootNodeId);
    }

    return dag;
  }

  public async initialize(): Promise<void> {
    console.log(`Initializing file synchronizer for ${this.rootDir}`);
    await this.loadSnapshot();
    this.merkleDAG = this.buildMerkleDAG(this.fileHashes);
    console.log(`[Synchronizer] Initialized. Loaded ${this.fileHashes.size} file hashes.`);
  }

  public async checkForChanges(): Promise<{ added: string[]; removed: string[]; modified: string[] }> {
    console.log('[Synchronizer] Checking for file changes...');

    const newFileHashes = await this.generateFileHashes(this.rootDir);
    const newMerkleDAG = this.buildMerkleDAG(newFileHashes);
    const changes = MerkleDAG.compare(this.merkleDAG, newMerkleDAG);

    if (changes.added.length > 0 || changes.removed.length > 0) {
      const fileChanges = this.compareStates(this.fileHashes, newFileHashes);
      this.fileHashes = newFileHashes;
      this.merkleDAG = newMerkleDAG;
      await this.saveSnapshot();
      return fileChanges;
    }

    return { added: [], removed: [], modified: [] };
  }

  private compareStates(
    oldHashes: Map<string, string>,
    newHashes: Map<string, string>,
  ): { added: string[]; removed: string[]; modified: string[] } {
    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    for (const [file, hash] of newHashes.entries()) {
      if (!oldHashes.has(file)) {
        added.push(file);
      } else if (oldHashes.get(file) !== hash) {
        modified.push(file);
      }
    }

    for (const file of oldHashes.keys()) {
      if (!newHashes.has(file)) removed.push(file);
    }

    return { added, removed, modified };
  }

  public getFileHash(filePath: string): string | undefined {
    return this.fileHashes.get(filePath);
  }

  private async saveSnapshot(): Promise<void> {
    const merkleDir = path.dirname(this.snapshotPath);
    await fs.mkdir(merkleDir, { recursive: true });

    const data = JSON.stringify({
      fileHashes: Array.from(this.fileHashes.entries()),
      merkleDAG: this.merkleDAG.serialize(),
    });
    await fs.writeFile(this.snapshotPath, data, 'utf-8');
  }

  private async loadSnapshot(): Promise<void> {
    try {
      const data = await fs.readFile(this.snapshotPath, 'utf-8');
      const obj = JSON.parse(data) as {
        fileHashes: [string, string][];
        merkleDAG?: { nodes: [string, MerkleDAGNode][]; rootIds: string[] };
      };

      this.fileHashes = new Map();
      for (const [key, value] of obj.fileHashes) {
        this.fileHashes.set(key, value);
      }

      if (obj.merkleDAG !== undefined) {
        this.merkleDAG = MerkleDAG.deserialize(obj.merkleDAG);
      }
    } catch (error: unknown) {
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.fileHashes = await this.generateFileHashes(this.rootDir);
        this.merkleDAG = this.buildMerkleDAG(this.fileHashes);
        await this.saveSnapshot();
      } else {
        throw error;
      }
    }
  }

  static async deleteSnapshot(codebasePath: string): Promise<void> {
    const snapshotPath = FileSynchronizer.getSnapshotPath(codebasePath);
    try {
      await fs.unlink(snapshotPath);
    } catch (error: unknown) {
      if (!(error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT')) {
        throw error;
      }
    }
  }
}

// Re-export MerkleDAGNode type for snapshot deserialization
import type { MerkleDAGNode } from './merkle.js';
export type { MerkleDAGNode };
