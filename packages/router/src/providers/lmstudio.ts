import OpenAI from "openai";
import { type LLMProvider, type Message, type CompletionOptions, type TextChunk, type EmbedOptions } from "../provider.js";

export class LMStudioProvider implements LLMProvider {
  readonly name = "lmstudio";
  readonly baseUrl: string;
  readonly model: string;

  private readonly client: OpenAI;
  private readonly embedModel: string;

  constructor(model = "local-model", embedModel = "local-embedding", host = "localhost:1234") {
    this.baseUrl = `http://${host}/v1`;
    this.model = model;
    this.embedModel = embedModel;
    this.client = new OpenAI({ apiKey: "lm-studio", baseURL: this.baseUrl });
  }

  static async healthCheck(host = "localhost:1234"): Promise<{ ok: boolean; models: string[] }> {
    try {
      const resp = await fetch(`http://${host}/v1/models`, { signal: AbortSignal.timeout(3000) });
      if (!resp.ok) return { ok: false, models: [] };
      const data = await resp.json() as { data?: Array<{ id: string }> };
      const models = (data.data ?? []).map((m) => m.id);
      return { ok: true, models };
    } catch {
      return { ok: false, models: [] };
    }
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
