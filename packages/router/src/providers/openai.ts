import OpenAI from "openai";
import { type LLMProvider, type Message, type CompletionOptions, type TextChunk, type EmbedOptions } from "../provider.js";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";

  private client: OpenAI;
  readonly model: string;
  private embedModel: string;

  constructor(model = "gpt-4o", embedModel = "text-embedding-3-small") {
    this.client = new OpenAI({ apiKey: process.env["OPENAI_API_KEY"] });
    this.model = model;
    this.embedModel = embedModel;
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<TextChunk> {
    const systemMessages: OpenAI.Chat.ChatCompletionMessageParam[] = opts.system
      ? [{ role: "system", content: opts.system }]
      : [];
    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4096,
      stream: true,
      messages: [
        ...systemMessages,
        ...messages.map((m) => ({ role: m.role, content: m.content } as OpenAI.Chat.ChatCompletionMessageParam)),
      ],
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta.content;
      if (text) yield { text };
    }
  }

  async embed(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    const model = opts?.model ?? this.embedModel;
    const res = await this.client.embeddings.create({ model, input: texts });
    return res.data.map((d) => d.embedding);
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
