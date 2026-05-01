import {
  GoogleGenerativeAI,
  type GenerativeModel,
} from "@google/generative-ai";
import { type LLMProvider, type Message, type CompletionOptions, type TextChunk, type EmbedOptions } from "../provider.js";

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private genai: GoogleGenerativeAI;
  private model: GenerativeModel;
  private embedModel: GenerativeModel;

  constructor(
    chatModel = "gemini-1.5-flash",
    embedModelName = "text-embedding-004"
  ) {
    this.genai = new GoogleGenerativeAI(process.env["GEMINI_API_KEY"] ?? "");
    this.model = this.genai.getGenerativeModel({ model: chatModel });
    this.embedModel = this.genai.getGenerativeModel({ model: embedModelName });
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<TextChunk> {
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;

    const chat = this.model.startChat({
      history,
      ...(opts.system !== undefined ? { systemInstruction: opts.system } : {}),
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 4096 },
    });
    const result = await chat.sendMessageStream(lastMsg.content);
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield { text };
    }
  }

  async embed(texts: string[], opts?: EmbedOptions): Promise<number[][]> {
    const model = opts?.model
      ? this.genai.getGenerativeModel({ model: opts.model })
      : this.embedModel;
    const results = await Promise.all(
      texts.map((t) => model.embedContent(t))
    );
    return results.map((r) => r.embedding.values);
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
