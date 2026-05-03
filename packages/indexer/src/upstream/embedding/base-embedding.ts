/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */

export interface EmbeddingVector {
  vector: number[];
  dimension: number;
}

export abstract class Embedding {
  protected abstract maxTokens: number;

  protected preprocessText(text: string): string {
    if (text === '') return ' ';
    const maxChars = this.maxTokens * 4;
    return text.length > maxChars ? text.substring(0, maxChars) : text;
  }

  abstract detectDimension(testText?: string): Promise<number>;

  protected preprocessTexts(texts: string[]): string[] {
    return texts.map((text) => this.preprocessText(text));
  }

  abstract embed(text: string): Promise<EmbeddingVector>;
  abstract embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
  abstract getDimension(): number;
  abstract getProvider(): string;
}
