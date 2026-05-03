/* Port of safishamsi/graphify extract.py to TypeScript.
   Uses web-tree-sitter (WASM) instead of native tree-sitter. */

import { Parser, Language, type Node as TSNode } from 'web-tree-sitter';
import { createRequire } from 'node:module';
import { dirname, join, basename, extname } from 'node:path';

const _req = createRequire(import.meta.url);

// --- types ---

export type SymbolKind =
  | 'class'
  | 'function'
  | 'method'
  | 'constructor'
  | 'interface'
  | 'type'
  | 'arrow_function';

export type EdgeKind = 'calls' | 'imports' | 'extends' | 'implements';

export interface ExtractedSymbol {
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  startByte: number;
  endByte: number;
  startLine: number;
  endLine: number;
  parentQualifiedName?: string | undefined;
  signature?: string | undefined;
}

export interface ExtractedEdge {
  srcQualifiedName: string;
  dstQualifiedName: string;
  kind: EdgeKind;
  confidence: number;
  line: number;
}

export interface ExtractResult {
  symbols: ExtractedSymbol[];
  edges: ExtractedEdge[];
}

// --- language configuration ---

interface LangConfig {
  wasmPkg: string;
  wasmFile: string;
  classTypes: Set<string>;
  functionTypes: Set<string>;
  methodTypes: Set<string>;
  importTypes: Set<string>;
  callTypes: Set<string>;
  callFunctionField: string;
  callMemberTypes: Set<string>;
  callMemberField: string;
  interfaceTypes: Set<string>;
  typeTypes: Set<string>;
}

const LANG_CONFIGS: Record<string, LangConfig> = {
  typescript: {
    wasmPkg: 'tree-sitter-typescript',
    wasmFile: 'tree-sitter-typescript.wasm',
    classTypes: new Set(['class_declaration']),
    functionTypes: new Set(['function_declaration']),
    methodTypes: new Set(['method_definition', 'abstract_method_signature']),
    importTypes: new Set(['import_statement']),
    callTypes: new Set(['call_expression', 'new_expression']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['member_expression']),
    callMemberField: 'property',
    interfaceTypes: new Set(['interface_declaration']),
    typeTypes: new Set(['type_alias_declaration', 'enum_declaration']),
  },
  tsx: {
    wasmPkg: 'tree-sitter-typescript',
    wasmFile: 'tree-sitter-tsx.wasm',
    classTypes: new Set(['class_declaration']),
    functionTypes: new Set(['function_declaration']),
    methodTypes: new Set(['method_definition']),
    importTypes: new Set(['import_statement']),
    callTypes: new Set(['call_expression', 'new_expression']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['member_expression']),
    callMemberField: 'property',
    interfaceTypes: new Set(['interface_declaration']),
    typeTypes: new Set(['type_alias_declaration']),
  },
  javascript: {
    wasmPkg: 'tree-sitter-javascript',
    wasmFile: 'tree-sitter-javascript.wasm',
    classTypes: new Set(['class_declaration']),
    functionTypes: new Set(['function_declaration']),
    methodTypes: new Set(['method_definition']),
    importTypes: new Set(['import_statement']),
    callTypes: new Set(['call_expression', 'new_expression']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['member_expression']),
    callMemberField: 'property',
    interfaceTypes: new Set(),
    typeTypes: new Set(),
  },
  python: {
    wasmPkg: 'tree-sitter-python',
    wasmFile: 'tree-sitter-python.wasm',
    classTypes: new Set(['class_definition']),
    functionTypes: new Set(['function_definition']),
    methodTypes: new Set(),
    importTypes: new Set(['import_statement', 'import_from_statement']),
    callTypes: new Set(['call']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['attribute']),
    callMemberField: 'attribute',
    interfaceTypes: new Set(),
    typeTypes: new Set(),
  },
  go: {
    wasmPkg: 'tree-sitter-go',
    wasmFile: 'tree-sitter-go.wasm',
    classTypes: new Set(),
    functionTypes: new Set(['function_declaration']),
    methodTypes: new Set(['method_declaration']),
    importTypes: new Set(['import_declaration']),
    callTypes: new Set(['call_expression']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['selector_expression']),
    callMemberField: 'field',
    interfaceTypes: new Set(['type_declaration']),
    typeTypes: new Set(['type_declaration']),
  },
  rust: {
    wasmPkg: 'tree-sitter-rust',
    wasmFile: 'tree-sitter-rust.wasm',
    classTypes: new Set(['impl_item']),
    functionTypes: new Set(['function_item']),
    methodTypes: new Set(),
    importTypes: new Set(['use_declaration']),
    callTypes: new Set(['call_expression', 'macro_invocation']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['field_expression', 'scoped_identifier']),
    callMemberField: 'field',
    interfaceTypes: new Set(['trait_item']),
    typeTypes: new Set(['struct_item', 'enum_item', 'type_item']),
  },
  java: {
    wasmPkg: 'tree-sitter-java',
    wasmFile: 'tree-sitter-java.wasm',
    classTypes: new Set(['class_declaration']),
    functionTypes: new Set(),
    methodTypes: new Set(['method_declaration', 'constructor_declaration']),
    importTypes: new Set(['import_declaration']),
    callTypes: new Set(['method_invocation', 'object_creation_expression']),
    callFunctionField: 'name',
    callMemberTypes: new Set(['method_invocation']),
    callMemberField: 'name',
    interfaceTypes: new Set(['interface_declaration']),
    typeTypes: new Set(['enum_declaration']),
  },
  cpp: {
    wasmPkg: 'tree-sitter-cpp',
    wasmFile: 'tree-sitter-cpp.wasm',
    classTypes: new Set(['class_specifier', 'struct_specifier']),
    functionTypes: new Set(['function_definition']),
    methodTypes: new Set(),
    importTypes: new Set(['preproc_include']),
    callTypes: new Set(['call_expression']),
    callFunctionField: 'function',
    callMemberTypes: new Set(['field_expression', 'qualified_identifier']),
    callMemberField: 'field',
    interfaceTypes: new Set(),
    typeTypes: new Set(['type_definition', 'enum_specifier']),
  },
};

const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  rs: 'rust',
  'c++': 'cpp',
  c: 'cpp',
  cs: 'csharp',
};

// --- extractor ---

let _initialized = false;

export class SymbolExtractor {
  private _parsers = new Map<string, Parser>();
  private _languages = new Map<string, Language>();

  private constructor() {}

  static async create(): Promise<SymbolExtractor> {
    if (!_initialized) {
      await Parser.init();
      _initialized = true;
    }
    return new SymbolExtractor();
  }

  async loadLanguage(lang: string): Promise<void> {
    const norm = this.normalizeLang(lang);
    if (this._languages.has(norm)) return;

    const cfg = LANG_CONFIGS[norm];
    if (cfg === undefined) throw new Error(`Unsupported language: ${lang}`);

    const pkgDir = dirname(_req.resolve(`${cfg.wasmPkg}/package.json`));
    const wasmPath = join(pkgDir, cfg.wasmFile);
    const language = await Language.load(wasmPath);
    this._languages.set(norm, language);
  }

  extract(code: string, lang: string, filePath?: string): ExtractResult {
    const norm = this.normalizeLang(lang);
    const language = this._languages.get(norm);
    if (language === undefined) throw new Error(`Language not loaded: ${lang}. Call loadLanguage() first.`);

    const cfg = LANG_CONFIGS[norm]!;
    const stem = filePath !== undefined ? basename(filePath, extname(filePath)) : 'unknown';

    if (!this._parsers.has(norm)) {
      const p = new Parser();
      p.setLanguage(language);
      this._parsers.set(norm, p);
    }

    const parser = this._parsers.get(norm)!;
    const tree = parser.parse(code);
    if (tree === null) return { symbols: [], edges: [] };

    const symbols: ExtractedSymbol[] = [];
    const edges: ExtractedEdge[] = [];
    const bodies: Array<{ qn: string; node: TSNode }> = [];

    this._walkSymbols(tree.rootNode, cfg, stem, symbols, edges, bodies, undefined);

    const symbolLookup = new Set(symbols.map((s) => s.name.toLowerCase()));
    for (const { qn, node } of bodies) {
      this._walkCalls(node, cfg, qn, edges, symbolLookup);
    }

    return { symbols, edges };
  }

  private _walkSymbols(
    node: TSNode,
    cfg: LangConfig,
    stem: string,
    symbols: ExtractedSymbol[],
    edges: ExtractedEdge[],
    bodies: Array<{ qn: string; node: TSNode }>,
    parentQN: string | undefined,
  ): void {
    const t = node.type;

    // imports
    if (cfg.importTypes.has(t)) {
      const src = this._importSource(node);
      if (src !== undefined) {
        edges.push({
          srcQualifiedName: parentQN ?? stem,
          dstQualifiedName: src,
          kind: 'imports',
          confidence: 1.0,
          line: node.startPosition.row + 1,
        });
      }
      return;
    }

    // classes
    if (cfg.classTypes.has(t)) {
      const name = this._fieldText(node, 'name');
      if (name !== undefined) {
        const qn = parentQN !== undefined ? `${parentQN}.${name}` : `${stem}.${name}`;
        symbols.push(this._mkSym(name, qn, 'class', node, parentQN));
        this._extractHeritage(node, qn, edges);
        const body = node.childForFieldName('body');
        if (body !== null) {
          for (const child of body.children) {
            this._walkSymbols(child, cfg, stem, symbols, edges, bodies, qn);
          }
        }
        return;
      }
    }

    // top-level functions
    if (cfg.functionTypes.has(t)) {
      const name = this._fieldText(node, 'name');
      if (name !== undefined) {
        const qn = parentQN !== undefined ? `${parentQN}.${name}` : `${stem}.${name}`;
        const kind: SymbolKind = parentQN !== undefined ? 'method' : 'function';
        symbols.push(this._mkSym(name, qn, kind, node, parentQN));
        const body = node.childForFieldName('body') ?? this._childOfType(node, 'block');
        if (body !== null) bodies.push({ qn, node: body });
        return;
      }
    }

    // methods
    if (cfg.methodTypes.has(t)) {
      const nameNode = node.childForFieldName('name');
      if (nameNode !== null) {
        const name = nameNode.text;
        const qn = parentQN !== undefined ? `${parentQN}.${name}` : `${stem}.${name}`;
        const kind: SymbolKind = name === 'constructor' ? 'constructor' : 'method';
        symbols.push(this._mkSym(name, qn, kind, node, parentQN));
        const body = node.childForFieldName('body');
        if (body !== null) bodies.push({ qn, node: body });
        return;
      }
    }

    // TypeScript interfaces and type aliases
    if (cfg.interfaceTypes.has(t)) {
      const name = this._fieldText(node, 'name');
      if (name !== undefined) {
        const qn = `${stem}.${name}`;
        symbols.push(this._mkSym(name, qn, 'interface', node, undefined));
      }
      return;
    }

    if (cfg.typeTypes.has(t) && !cfg.interfaceTypes.has(t)) {
      const name = this._fieldText(node, 'name');
      if (name !== undefined) {
        const qn = `${stem}.${name}`;
        symbols.push(this._mkSym(name, qn, 'type', node, undefined));
      }
      return;
    }

    // arrow functions / function expressions assigned to variables
    if (t === 'lexical_declaration' || t === 'variable_declaration') {
      for (const child of node.children) {
        if (child.type === 'variable_declarator') {
          const nameNode = child.childForFieldName('name');
          const valNode = child.childForFieldName('value');
          if (
            nameNode !== null &&
            valNode !== null &&
            (valNode.type === 'arrow_function' || valNode.type === 'function_expression')
          ) {
            const name = nameNode.text;
            const qn = parentQN !== undefined ? `${parentQN}.${name}` : `${stem}.${name}`;
            symbols.push(this._mkSym(name, qn, 'arrow_function', node, parentQN));
            const body = valNode.childForFieldName('body');
            if (body !== null) bodies.push({ qn, node: body });
          }
        }
      }
      return;
    }

    // export statements — unwrap and re-walk
    if (t === 'export_statement') {
      const decl = node.childForFieldName('declaration');
      if (decl !== null) {
        this._walkSymbols(decl, cfg, stem, symbols, edges, bodies, parentQN);
        return;
      }
    }

    // default: recurse
    for (const child of node.children) {
      this._walkSymbols(child, cfg, stem, symbols, edges, bodies, parentQN);
    }
  }

  private _walkCalls(
    body: TSNode,
    cfg: LangConfig,
    callerQN: string,
    edges: ExtractedEdge[],
    knownNames: Set<string>,
  ): void {
    const walk = (node: TSNode): void => {
      if (cfg.callTypes.has(node.type)) {
        const fnNode = node.childForFieldName(cfg.callFunctionField);
        if (fnNode !== null) {
          let callee: string;
          if (cfg.callMemberTypes.has(fnNode.type)) {
            const prop = fnNode.childForFieldName(cfg.callMemberField);
            callee = prop !== null ? prop.text : fnNode.text;
          } else {
            callee = fnNode.text;
          }
          if (knownNames.has(callee.toLowerCase())) {
            edges.push({
              srcQualifiedName: callerQN,
              dstQualifiedName: callee.toLowerCase(),
              kind: 'calls',
              confidence: 0.8,
              line: node.startPosition.row + 1,
            });
          }
        }
      }
      for (const child of node.children) walk(child);
    };
    walk(body);
  }

  private _extractHeritage(
    classNode: TSNode,
    classQN: string,
    edges: ExtractedEdge[],
  ): void {
    const heritage =
      classNode.childForFieldName('heritage') ?? this._childOfType(classNode, 'class_heritage');
    if (heritage === null) return;
    const line = heritage.startPosition.row + 1;

    for (const child of heritage.children) {
      if (child.type === 'extends_clause') {
        const first = child.namedChildren[0];
        if (first !== undefined) {
          edges.push({ srcQualifiedName: classQN, dstQualifiedName: first.text, kind: 'extends', confidence: 1.0, line });
        }
      }
      if (child.type === 'implements_clause') {
        for (const impl of child.namedChildren) {
          if (impl.type !== ',') {
            edges.push({ srcQualifiedName: classQN, dstQualifiedName: impl.text, kind: 'implements', confidence: 1.0, line });
          }
        }
      }
    }
  }

  private _mkSym(
    name: string,
    qualifiedName: string,
    kind: SymbolKind,
    node: TSNode,
    parentQN: string | undefined,
  ): ExtractedSymbol {
    const sym: ExtractedSymbol = {
      name,
      qualifiedName,
      kind,
      startByte: node.startIndex,
      endByte: node.endIndex,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
    };
    if (parentQN !== undefined) sym.parentQualifiedName = parentQN;
    return sym;
  }

  private _fieldText(node: TSNode, field: string): string | undefined {
    const child = node.childForFieldName(field);
    return child !== null ? child.text : undefined;
  }

  private _childOfType(node: TSNode, type: string): TSNode | null {
    for (const child of node.children) {
      if (child.type === type) return child;
    }
    return null;
  }

  private _importSource(node: TSNode): string | undefined {
    const source = node.childForFieldName('source');
    if (source !== null) return source.text.replace(/['"]/g, '');
    // fallback for preproc_include (C/C++)
    const path = node.childForFieldName('path');
    if (path !== null) return path.text.replace(/[<>"]/g, '');
    return undefined;
  }

  private normalizeLang(lang: string): string {
    const l = lang.toLowerCase();
    return LANG_ALIASES[l] ?? l;
  }
}
