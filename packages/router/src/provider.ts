/** Tag applied to every LLM call so the routing engine picks the right model. */
export type TaskTag =
  | "embed"
  | "summarize"
  | "plan"
  | "code-gen"
  | "classify"
  | "sanitize";

export interface CompletionOptions {
  tag: TaskTag;
  /** Max tokens to generate. */
  maxTokens?: number;
  /** Temperature (0-1). */
  temperature?: number;
  /** System prompt prepended before messages. */
  system?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface TextChunk {
  text: string;
}

export interface EmbedOptions {
  model?: string;
}

/**
 * Every provider adapter implements this interface.
 * No package other than @coderelay/router imports provider SDKs directly.
 */
export interface LLMProvider {
  readonly name: string;

  /**
   * Streaming text completion.
   * Yields chunks in order; caller joins them for the full response.
   */
  complete(
    messages: Message[],
    opts: CompletionOptions
  ): AsyncIterable<TextChunk>;

  /**
   * Dense vector embeddings.
   * Returns one float[] per input string, in the same order.
   */
  embed(texts: string[], opts?: EmbedOptions): Promise<number[][]>;

  /**
   * Approximate token count for budget enforcement.
   * Implementations may use a fast heuristic (chars/4) when the provider
   * does not expose a token counter.
   */
  countTokens(text: string): number;
}
