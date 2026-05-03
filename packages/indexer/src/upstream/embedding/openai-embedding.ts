/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */

import OpenAI from 'openai';
import { Embedding, type EmbeddingVector } from './base-embedding.js';

export interface OpenAIEmbeddingConfig {
  model: string;
  apiKey: string;
  baseURL?: string | undefined;
}

type ModelInfo = { dimension: number; description: string };

export class OpenAIEmbedding extends Embedding {
  private client: OpenAI;
  private config: OpenAIEmbeddingConfig;
  private dimension: number = 1536;
  protected maxTokens: number = 8192;

  constructor(config: OpenAIEmbeddingConfig) {
    super();
    this.config = config;
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL });
  }

  async detectDimension(testText = 'test'): Promise<number> {
    const model = this.config.model || 'text-embedding-3-small';
    const knownModels = OpenAIEmbedding.getSupportedModels();
    const modelInfo = knownModels[model];
    if (modelInfo !== undefined) return modelInfo.dimension;

    const processedText = this.preprocessText(testText);
    const response = await this.client.embeddings.create({
      model,
      input: processedText,
      encoding_format: 'float',
    });
    return response.data[0]?.embedding.length ?? 1536;
  }

  async embed(text: string): Promise<EmbeddingVector> {
    const processedText = this.preprocessText(text);
    const model = this.config.model || 'text-embedding-3-small';
    await this.syncDimension(model);

    const response = await this.client.embeddings.create({
      model,
      input: processedText,
      encoding_format: 'float',
    });

    this.dimension = response.data[0]?.embedding.length ?? this.dimension;
    return { vector: response.data[0]?.embedding ?? [], dimension: this.dimension };
  }

  async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
    const processedTexts = this.preprocessTexts(texts);
    const model = this.config.model || 'text-embedding-3-small';
    await this.syncDimension(model);

    const response = await this.client.embeddings.create({
      model,
      input: processedTexts,
      encoding_format: 'float',
    });

    this.dimension = response.data[0]?.embedding.length ?? this.dimension;
    return response.data.map((item) => ({ vector: item.embedding, dimension: this.dimension }));
  }

  getDimension(): number {
    const modelInfo = OpenAIEmbedding.getSupportedModels()[this.config.model || 'text-embedding-3-small'];
    return modelInfo !== undefined ? modelInfo.dimension : this.dimension;
  }

  getProvider(): string {
    return 'OpenAI';
  }

  async setModel(model: string): Promise<void> {
    this.config.model = model;
    await this.syncDimension(model);
  }

  getClient(): OpenAI {
    return this.client;
  }

  static getSupportedModels(): Record<string, ModelInfo> {
    return {
      'text-embedding-3-small': { dimension: 1536, description: 'High performance and cost-effective (recommended)' },
      'text-embedding-3-large': { dimension: 3072, description: 'Highest performance with larger dimensions' },
      'text-embedding-ada-002': { dimension: 1536, description: 'Legacy model' },
    };
  }

  private async syncDimension(model: string): Promise<void> {
    const modelInfo = OpenAIEmbedding.getSupportedModels()[model];
    if (modelInfo !== undefined) {
      this.dimension = modelInfo.dimension;
    } else {
      this.dimension = await this.detectDimension();
    }
  }
}
