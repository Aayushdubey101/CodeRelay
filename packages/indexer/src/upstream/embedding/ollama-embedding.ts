/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */

import { Ollama } from 'ollama';
import { Embedding, type EmbeddingVector } from './base-embedding.js';

export interface OllamaEmbeddingConfig {
  model: string;
  host?: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fetch?: any;
  keepAlive?: string | number | undefined;
  options?: Record<string, unknown> | undefined;
  dimension?: number | undefined;
  maxTokens?: number | undefined;
}

export class OllamaEmbedding extends Embedding {
  private client: Ollama;
  private config: OllamaEmbeddingConfig;
  private dimension: number = 768;
  private dimensionDetected: boolean = false;
  protected maxTokens: number = 2048;

  constructor(config: OllamaEmbeddingConfig) {
    super();
    this.config = config;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.client = new Ollama({ host: config.host ?? 'http://127.0.0.1:11434', fetch: config.fetch });

    if (config.dimension !== undefined) {
      this.dimension = config.dimension;
      this.dimensionDetected = true;
    }

    if (config.maxTokens !== undefined) {
      this.maxTokens = config.maxTokens;
    } else {
      this.setDefaultMaxTokensForModel(config.model);
    }
  }

  private setDefaultMaxTokensForModel(model: string): void {
    if (model?.includes('nomic-embed-text') || model?.includes('snowflake-arctic-embed')) {
      this.maxTokens = 8192;
    } else {
      this.maxTokens = 2048;
    }
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const processedText = this.preprocessText(text);
    if (!this.dimensionDetected && this.config.dimension === undefined) {
      this.dimension = await this.detectDimension();
      this.dimensionDetected = true;
    }

    const response = await this.client.embed({
      model: this.config.model,
      input: processedText,
      options: this.config.options as Record<string, number>,
      ...(this.config.keepAlive !== undefined && this.config.keepAlive !== ''
        ? { keep_alive: this.config.keepAlive }
        : {}),
    });

    const embedding = response.embeddings[0];
    if (embedding === undefined) throw new Error('Ollama API returned invalid response');
    return { vector: embedding, dimension: this.dimension };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const processedTexts = this.preprocessTexts(texts);
    if (!this.dimensionDetected && this.config.dimension === undefined) {
      this.dimension = await this.detectDimension();
      this.dimensionDetected = true;
    }

    const response = await this.client.embed({
      model: this.config.model,
      input: processedTexts,
      options: this.config.options as Record<string, number>,
      ...(this.config.keepAlive !== undefined && this.config.keepAlive !== ''
        ? { keep_alive: this.config.keepAlive }
        : {}),
    });

    if (!Array.isArray(response.embeddings)) throw new Error('Ollama API returned invalid batch response');
    return response.embeddings.map((embedding) => ({ vector: embedding, dimension: this.dimension }));
  }

  getDimension(): number {
    return this.dimension;
  }

  getProvider(): string {
    return 'Ollama';
  }

  async detectDimension(testText = 'test'): Promise<number> {
    const processedText = this.preprocessText(testText);
    const response = await this.client.embed({
      model: this.config.model,
      input: processedText,
      options: this.config.options as Record<string, number>,
      ...(this.config.keepAlive !== undefined && this.config.keepAlive !== ''
        ? { keep_alive: this.config.keepAlive }
        : {}),
    });

    const embedding = response.embeddings[0];
    if (embedding === undefined) throw new Error('Ollama API returned invalid response');
    return embedding.length;
  }

  async setModel(model: string): Promise<void> {
    this.config.model = model;
    this.dimensionDetected = false;
    this.setDefaultMaxTokensForModel(model);
    if (this.config.dimension === undefined) {
      this.dimension = await this.detectDimension();
      this.dimensionDetected = true;
    }
  }

  setHost(host: string): void {
    this.config.host = host;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    this.client = new Ollama({ host, fetch: this.config.fetch });
  }

  setKeepAlive(keepAlive: string | number): void {
    this.config.keepAlive = keepAlive;
  }

  setOptions(options: Record<string, unknown>): void {
    this.config.options = options;
  }

  setMaxTokens(maxTokens: number): void {
    this.config.maxTokens = maxTokens;
    this.maxTokens = maxTokens;
  }

  getClient(): Ollama {
    return this.client;
  }
}
