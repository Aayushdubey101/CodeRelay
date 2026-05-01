import Anthropic from "@anthropic-ai/sdk";
import { type LLMProvider, type Message, type CompletionOptions, type TextChunk } from "../provider.js";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  private client: Anthropic;
  readonly model: string;

  constructor(model = "claude-sonnet-4-6") {
    this.client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
    this.model = model;
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<TextChunk> {
    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4096,
      ...(opts.system !== undefined ? { system: opts.system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { text: event.delta.text };
      }
    }
  }

  embed(_texts: string[]): Promise<number[][]> {
    throw new Error("AnthropicProvider does not support embeddings. Use OllamaProvider or OpenAIProvider.");
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
