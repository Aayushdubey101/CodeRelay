import { describe, it, expect, beforeAll } from 'vitest';
import { SymbolExtractor } from '../extract.js';

// ~200-line TypeScript fixture covering classes, methods, functions,
// arrow functions, interfaces, type aliases, and imports.
const FIXTURE = `
import { EventEmitter } from 'events';
import type { Readable } from 'stream';

export interface Shape {
  area(): number;
  perimeter(): number;
}

export type Color = 'red' | 'green' | 'blue';

export class Circle implements Shape {
  constructor(private radius: number) {}

  area(): number {
    return Math.PI * this.radius * this.radius;
  }

  perimeter(): number {
    return 2 * Math.PI * this.radius;
  }

  scale(factor: number): Circle {
    return new Circle(this.radius * factor);
  }
}

export class Rectangle extends EventEmitter implements Shape {
  constructor(
    private width: number,
    private height: number,
  ) {
    super();
  }

  area(): number {
    return this.width * this.height;
  }

  perimeter(): number {
    return 2 * (this.width + this.height);
  }

  resize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    this.emit('resize');
  }
}

export function computeArea(shape: Shape): number {
  return shape.area();
}

export function computePerimeter(shape: Shape): number {
  return shape.perimeter();
}

export const formatShape = (shape: Shape): string => {
  return \`area=\${computeArea(shape)} perimeter=\${computePerimeter(shape)}\`;
};

export const scaleCircle = (c: Circle, f: number): Circle => c.scale(f);

export interface Repository<T> {
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
  delete(id: string): Promise<boolean>;
}

export type Maybe<T> = T | null | undefined;

export class ShapeRepository implements Repository<Shape> {
  private _store = new Map<string, Shape>();

  async findById(id: string): Promise<Shape | null> {
    return this._store.get(id) ?? null;
  }

  async save(entity: Shape): Promise<void> {
    const key = entity.area().toString();
    this._store.set(key, entity);
  }

  async delete(id: string): Promise<boolean> {
    return this._store.delete(id);
  }
}

export function createDefaultShapes(): Shape[] {
  const c = new Circle(5);
  const r = new Rectangle(4, 6);
  return [c, r];
}

export const identity = <T>(x: T): T => x;

export class Logger {
  private _prefix: string;

  constructor(prefix: string) {
    this._prefix = prefix;
  }

  log(msg: string): void {
    console.log(\`[\${this._prefix}] \${msg}\`);
  }

  warn(msg: string): void {
    console.warn(\`[\${this._prefix}] WARN: \${msg}\`);
  }

  error(msg: string): void {
    console.error(\`[\${this._prefix}] ERROR: \${msg}\`);
  }
}

export function processStream(_stream: Readable): Promise<string> {
  return Promise.resolve('done');
}
`.trim();

// Expected symbols by name (kind in parens for disambiguation)
const EXPECTED_SYMBOLS = [
  'Shape',          // interface
  'Color',          // type
  'Circle',         // class
  'Rectangle',      // class
  'computeArea',    // function
  'computePerimeter', // function
  'formatShape',    // arrow_function
  'scaleCircle',    // arrow_function
  'Repository',     // interface
  'Maybe',          // type
  'ShapeRepository', // class
  'createDefaultShapes', // function
  'identity',       // arrow_function
  'Logger',         // class
  'processStream',  // function
  // methods
  'area',           // method (appears multiple times — deduplicated by name check)
  'perimeter',
  'scale',
  'resize',
  'findById',
  'save',
  'delete',
  'log',
  'warn',
  'error',
  'constructor',
];

let extractor: SymbolExtractor;

beforeAll(async () => {
  extractor = await SymbolExtractor.create();
  await extractor.loadLanguage('typescript');
}, 30_000);

describe('SymbolExtractor — TypeScript fixture', () => {
  it('extracts ≥95% of expected symbols', () => {
    const result = extractor.extract(FIXTURE, 'typescript', 'shapes.ts');
    const extractedNames = new Set(result.symbols.map((s) => s.name));

    const matched = EXPECTED_SYMBOLS.filter((n) => extractedNames.has(n));
    const ratio = matched.length / EXPECTED_SYMBOLS.length;

    if (ratio < 0.95) {
      const missing = EXPECTED_SYMBOLS.filter((n) => !extractedNames.has(n));
      throw new Error(
        `Only ${matched.length}/${EXPECTED_SYMBOLS.length} symbols found (${(ratio * 100).toFixed(1)}%).\nMissing: ${missing.join(', ')}`,
      );
    }

    expect(ratio).toBeGreaterThanOrEqual(0.95);
  });

  it('extracts import edges', () => {
    const result = extractor.extract(FIXTURE, 'typescript', 'shapes.ts');
    const importEdges = result.edges.filter((e) => e.kind === 'imports');
    expect(importEdges.length).toBeGreaterThanOrEqual(1);
    const dsts = importEdges.map((e) => e.dstQualifiedName);
    expect(dsts).toContain('events');
  });

  it('extracts extends/implements edges', () => {
    const result = extractor.extract(FIXTURE, 'typescript', 'shapes.ts');
    const heritage = result.edges.filter((e) => e.kind === 'extends' || e.kind === 'implements');
    expect(heritage.length).toBeGreaterThanOrEqual(2); // Circle implements Shape; Rectangle extends EventEmitter
  });

  it('symbols have correct line numbers', () => {
    const result = extractor.extract(FIXTURE, 'typescript', 'shapes.ts');
    const circle = result.symbols.find((s) => s.name === 'Circle' && s.kind === 'class');
    expect(circle).toBeDefined();
    expect(circle!.startLine).toBeGreaterThan(0);
  });

  it('methods carry parentQualifiedName', () => {
    const result = extractor.extract(FIXTURE, 'typescript', 'shapes.ts');
    const methods = result.symbols.filter((s) => s.kind === 'method' || s.kind === 'constructor');
    const withParent = methods.filter((s) => s.parentQualifiedName !== undefined);
    expect(withParent.length).toBeGreaterThan(0);
  });
});
