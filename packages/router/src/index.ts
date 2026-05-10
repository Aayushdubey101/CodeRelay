import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/router");

export { Router } from "./router.js";
export { RoutingEngine } from "./routing.js";
export { UsageTracker, estimateCost } from "./usage.js";
export { withRetry, CircuitBreaker, RetryExhaustedError } from "./retry.js";
export { AnthropicProvider } from "./providers/anthropic.js";
export { OpenAIProvider } from "./providers/openai.js";
export { GeminiProvider } from "./providers/gemini.js";
export { OllamaProvider } from "./providers/ollama.js";
export { OpenRouterProvider } from "./providers/openrouter.js";
export { LMStudioProvider } from "./providers/lmstudio.js";
export type { LLMProvider, Message, CompletionOptions, TextChunk, TaskTag, EmbedOptions } from "./provider.js";
