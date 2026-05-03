import { type Logger } from "@coderelay/core";
import { createLogger } from "@coderelay/core";

export const log: Logger = createLogger("@coderelay/governor");

export { checkBlocklist, BLOCKLIST_PATTERNS } from "./blocklist.js";
export type { BlockResult } from "./blocklist.js";

export { PolicyEngine } from "./policy.js";
export type { PolicyConfig, PolicyResult } from "./policy.js";

export { Governor } from "./governor.js";
export type { GovernorResult } from "./governor.js";

export { createWorktree, removeWorktree, mergeWorktree, rollbackWorktree } from "./worktree.js";
export type { WorktreeInfo, WorktreeOptions } from "./worktree.js";

export { ActionLog, defaultLogPath } from "./actionlog.js";
export type { ActionEntry, ActionKind } from "./actionlog.js";

export { sanitize, hasInjection } from "./sanitizer.js";
export type { SanitizeResult, InjectionMatch, InjectionSeverity } from "./sanitizer.js";

export { scanSecrets, hasSecrets } from "./secrets.js";
export type { ScanResult, SecretMatch } from "./secrets.js";

export { EgressFilter, hostnameFromUrl } from "./egress.js";
export type { EgressConfig, EgressResult } from "./egress.js";
