# CodeRelay Safety Documentation

CodeRelay operates a multi-layer safety system. Every sub-agent action passes through the Governor before execution.

## Layer 1 — Hard-Coded Destructive Blocklist

**Never user-configurable.** These patterns are blocked regardless of policy config:

| Pattern | Reason |
|---------|--------|
| `rm -rf` | Recursive delete |
| `DROP TABLE`, `DROP DATABASE` | Irreversible data loss |
| `git push --force` (and `--force-with-lease`) | Overwrites remote history |
| `chmod 777 -R` | World-writable recursive |
| `:(){ :|:& };:` | Fork bomb |
| `mkfs`, `fdisk`, `dd if=` | Disk operations |
| `> /dev/sda` | Direct disk write |
| `shutdown`, `reboot`, `halt` | System shutdown |
| `curl … | sh`, `wget … | bash` | Remote code execution |
| `eval $(...)` | Eval injection |
| `export PATH=` | PATH hijacking |
| `iptables -F`, `ufw disable` | Firewall disable |
| `crontab -r` | Cron wipe |
| `history -c` | History wipe |
| `truncate -s 0` | File wipe |

The check runs before any policy evaluation. Block is permanent — no override exists.

## Layer 2 — Policy Engine

YAML-driven allow/deny list for:
- **Shell commands** — regex patterns on the full command string
- **File paths** — glob patterns on write targets
- **Environment variables** — which env vars the sub-agent may read
- **Network egress** — allowed domain list (Docker mode)

Configuration: see `governor.allowedPaths` and `governor.extraDenyPatterns` in [configuring.md](configuring.md).

## Layer 3 — Prompt Injection Sanitizer

All external text fed into the LLM (file contents, README files, API responses) is scanned for injection patterns before being included in prompts:

- `ignore previous instructions`
- `system:` prefix
- Embedded tool calls (`<tool_use>`, `<function_call>`)
- Role-switching attempts (`you are now`, `act as`)
- Instruction overrides (`your new instructions are`)

Severity: **warn** (flagged in log) or **block** (stripped from prompt), depending on confidence.

## Layer 4 — Secret Scanner

File content and sub-agent outputs are scanned for secrets before being sent to the LLM or written to disk. Rules based on gitleaks patterns:

- AWS access keys (`AKIA...`)
- GitHub tokens (`ghp_`, `ghs_`)
- Generic API key patterns (`sk-`, `Bearer `, `api_key =`)
- Private keys (`-----BEGIN ... PRIVATE KEY-----`)
- Connection strings with embedded passwords

Detected secrets are **masked** (`***REDACTED***`) before LLM ingestion.

## Layer 5 — Worktree Sandbox

Every task runs in a dedicated git worktree branch `coderelay/task-<uuid>`:

1. Branch forked from current HEAD at task start
2. All sub-agent writes go to the worktree, not main
3. After task completion, diff is presented for review
4. Merge to main requires explicit approval (`coderelay approve <task-id>`)
5. Failed or rejected tasks: `coderelay rollback <task-id>` removes the branch

## Layer 6 — Append-Only Action Log

Every sub-agent action is logged to `.coderelay/action.log` (JSONL):

```json
{"ts":1715000000000,"taskId":"abc123","kind":"agent_start","payload":{"step":1,"agent":"claude"}}
{"ts":1715000001000,"taskId":"abc123","kind":"agent_end","payload":{"step":1,"success":true}}
```

Log is append-only. `coderelay log` reads it. `coderelay rollback` uses it to identify the merge commit to revert.

## What CodeRelay Does NOT Prevent

- Bugs in correct-looking code (that's the sub-agent's problem, verified by your test suite)
- Mistakes in your allow-list configuration
- Secrets that don't match the scanner's pattern library
- Actions by code the sub-agent generates but you manually run outside CodeRelay

## Reporting Security Issues

Open an issue at [github.com/Aayushdubey101/CodeRelay](https://github.com/Aayushdubey101/CodeRelay) marked `security`.
