import { type LLMProvider, type Message, type CompletionOptions, type TextChunk, type EmbedOptions } from '../provider.js';

interface OpenRouterChunk {
  choices?: Array<{ delta?: { content?: string } }>;
}

export class OpenRouterProvider implements LLMProvider {
  readonly name = 'openrouter';
  private readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl = 'https://openrouter.ai/api/v1';

  constructor(model = 'anthropic/claude-sonnet-4-6') {
    this.model = model;
    const key = process.env['OPENROUTER_API_KEY'];
    if (!key) throw new Error('OPENROUTER_API_KEY env var not set');
    this.apiKey = key;
  }

  async *complete(messages: Message[], opts: CompletionOptions): AsyncIterable<TextChunk> {
    const body = JSON.stringify({
      model: this.model,
      stream: true,
      max_tokens: opts.maxTokens ?? 4096,
      messages: [
        ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
    });

    const resp = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/coderelay',
        'X-Title': 'CodeRelay',
      },
      body,
    });

    if (!resp.ok) {
      throw new Error(`OpenRouter error ${resp.status}: ${await resp.text()}`);
    }

    if (!resp.body) return;

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;
        try {
          const chunk = JSON.parse(data) as OpenRouterChunk;
          const text = chunk.choices?.[0]?.delta?.content;
          if (text) yield { text };
        } catch { /* skip malformed SSE lines */ }
      }
    }
  }

  async embed(_texts: string[], _opts?: EmbedOptions): Promise<number[][]> {
    throw new Error('OpenRouterProvider does not support embeddings — use OllamaProvider or OpenAIProvider for embed tasks');
  }

  countTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
