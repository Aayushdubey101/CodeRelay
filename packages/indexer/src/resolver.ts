/* 6-strategy call-edge resolver.
   Port of Codebase-Memory paper (arxiv 2603.27277) resolution logic.
   See LICENSES/graphify-LICENSE.txt for upstream attribution. */

import type { ExtractedEdge, ExtractedSymbol } from './extract.js';

export type ResolutionStrategy =
  | 'exact'
  | 'local_scope'
  | 'file_alias'
  | 'import_resolved'
  | 'type_hint'
  | 'fuzzy'
  | 'unresolved';

export interface ResolvedEdge extends ExtractedEdge {
  resolved: boolean;
  strategy: ResolutionStrategy;
}

/**
 * Resolves raw dstQualifiedName strings (as produced by SymbolExtractor) to
 * fully-qualified names that match known symbols, using 6 ordered strategies.
 *
 * Construct once per file-set; call resolve() for each file's edges.
 */
export class EdgeResolver {
  private readonly _byQN: Map<string, ExtractedSymbol>;
  private readonly _byName: Map<string, ExtractedSymbol[]>;

  constructor(symbols: ExtractedSymbol[]) {
    this._byQN = new Map(symbols.map((s) => [s.qualifiedName, s]));
    this._byName = new Map();
    for (const s of symbols) {
      const key = s.name.toLowerCase();
      const bucket = this._byName.get(key) ?? [];
      bucket.push(s);
      this._byName.set(key, bucket);
    }
  }

  /**
   * @param edges          Raw edges from SymbolExtractor.extract()
   * @param importBindings local-name → qualified-name map built from import edges
   *                       e.g. "add" → "util.add" when calc.ts imports from util.ts
   */
  resolve(edges: ExtractedEdge[], importBindings?: Map<string, string>): ResolvedEdge[] {
    const bindings = importBindings ?? new Map<string, string>();
    return edges.map((e) => this._resolveOne(e, bindings));
  }

  private _resolveOne(edge: ExtractedEdge, importBindings: Map<string, string>): ResolvedEdge {
    const dst = edge.dstQualifiedName;

    // Non-call edges pass through; just flag whether dst is a known symbol
    if (edge.kind !== 'calls') {
      const hit = this._byQN.has(dst);
      return { ...edge, resolved: hit, strategy: hit ? 'exact' : 'unresolved' };
    }

    // Strategy 1 — exact qualified name
    if (this._byQN.has(dst)) {
      return { ...edge, confidence: 1.0, resolved: true, strategy: 'exact' };
    }

    // Strategy 2 — local scope (same file stem, or same class)
    const srcParts = edge.srcQualifiedName.split('.');
    const fileStem = srcParts[0] ?? '';

    const localQN = `${fileStem}.${dst}`;
    if (this._byQN.has(localQN)) {
      return { ...edge, dstQualifiedName: localQN, confidence: 0.95, resolved: true, strategy: 'local_scope' };
    }

    // Also try class-scoped: stem.ClassName.methodName
    if (srcParts.length >= 3) {
      const classQN = `${srcParts[0]!}.${srcParts[1]!}.${dst}`;
      if (this._byQN.has(classQN)) {
        return { ...edge, dstQualifiedName: classQN, confidence: 0.95, resolved: true, strategy: 'local_scope' };
      }
    }

    // Strategy 3 — file-scope alias (explicit import binding)
    const bound = importBindings.get(dst) ?? importBindings.get(dst.toLowerCase());
    if (bound !== undefined) {
      const resolved = this._byQN.has(bound);
      return { ...edge, dstQualifiedName: bound, confidence: 0.9, resolved, strategy: 'file_alias' };
    }

    // Strategy 4 — import-resolved: unique name across all known symbols
    const candidates = this._byName.get(dst.toLowerCase()) ?? [];
    if (candidates.length === 1) {
      const c = candidates[0]!;
      return { ...edge, dstQualifiedName: c.qualifiedName, confidence: 0.85, resolved: true, strategy: 'import_resolved' };
    }

    // Strategy 5 — type-system hint: member access — resolve the root object
    if (dst.includes('.')) {
      const [root, ...rest] = dst.split('.');
      if (root !== undefined && rest.length > 0) {
        const rootCandidates = this._byName.get(root.toLowerCase()) ?? [];
        if (rootCandidates.length === 1) {
          const c = rootCandidates[0]!;
          const reconstructed = `${c.qualifiedName}.${rest.join('.')}`;
          return {
            ...edge,
            dstQualifiedName: reconstructed,
            confidence: 0.75,
            resolved: this._byQN.has(reconstructed),
            strategy: 'type_hint',
          };
        }
      }
    }

    // Strategy 6 — fuzzy name match (Levenshtein ≤ 2)
    const fuzzy = this._fuzzyMatch(dst.toLowerCase());
    if (fuzzy !== undefined) {
      return { ...edge, dstQualifiedName: fuzzy.qualifiedName, confidence: 0.5, resolved: true, strategy: 'fuzzy' };
    }

    return { ...edge, resolved: false, strategy: 'unresolved' };
  }

  private _fuzzyMatch(target: string): ExtractedSymbol | undefined {
    let best: ExtractedSymbol | undefined;
    let bestDist = 3; // exclusive upper bound (≤ 2 accepted)
    for (const [name, bucket] of this._byName) {
      const d = levenshtein(target, name);
      if (d < bestDist) {
        bestDist = d;
        best = bucket[0];
      }
    }
    return best;
  }
}

// --- helpers ---

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Single-row DP
  const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const diag = row[j - 1]!;
      const up = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? diag : Math.min(diag, up, prev) + 1;
      row[j - 1] = prev;
      prev = cost;
    }
    row[b.length] = prev;
  }

  return row[b.length]!;
}
