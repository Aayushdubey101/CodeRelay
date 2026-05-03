import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/governor");

export { checkBlocklist, BLOCKLIST_PATTERNS } from "./blocklist.js";
export type { BlockResult } from "./blocklist.js";

export { PolicyEngine } from "./policy.js";
export type { PolicyConfig, PolicyResult } from "./policy.js";

export { Governor } from "./governor.js";
export type { GovernorResult } from "./governor.js";
