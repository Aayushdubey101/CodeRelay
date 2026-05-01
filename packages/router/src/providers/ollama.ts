import { Ollama } from "ollama";
import { type LLMProvider, type Message, type CompletionOptions, type TextChunk, type EmbedOptions } from "../provider.js";

export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";

  private client: Ollama;
  readonly model: string;
  private embedModel: string;

  constructor(
    model = "llama3.2",
    embedModel = "nomic-embed-text",
    host = process.env["OLLAMA_HOST"] ?? "http://localhost:11434"
  ) {
    this.client = new Ollama({ host });
    this.model = model;
    this.embedModel = embedModel;
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<TextChunk> {
    const ollamaMessages = [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];
    const stream = await this.client.chat({
      model: this.model,
      messages: ollamaMessages,
      stream: true,
      options: { num_predict: opts.maxTokens ?? 4096 },
    });
    for await (const part of stream) {
      if (part.message.content) yield { text: part.message.content };
    }
  }

  async embed(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    const model = opts?.model ?? this.embedModel;
    const results = await Promise.all(
      texts.map((t) => this.client.embeddings({ model, prompt: t }))
    );
    return results.map((r) => r.embedding);
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
