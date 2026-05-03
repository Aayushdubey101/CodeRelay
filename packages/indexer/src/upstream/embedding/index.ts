/* Adapted from zilliztech/claude-context@ead19f4, MIT. See LICENSES/claude-context-LICENSE.txt */
/* NOTE: gemini-embedding and voyageai-embedding deferred — need @google/genai
   and voyageai packages not yet in workspace. Add in task 2.5 when wiring
   embedding providers through @coderelay/router. */

export * from './base-embedding.js';
export * from './openai-embedding.js';
export * from './ollama-embedding.js';
