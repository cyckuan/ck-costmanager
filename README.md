# ck-costmanager

A Claude Code plugin that tracks token usage and calculates costs. Tracking is on by default — no setup required.

## Commands

| Command | Description |
|---------|-------------|
| `/cost report` | Show cost summary with cumulative chart |
| `/cost budget <USD>` | Set session budget (default: $10) |
| `/cost off` | Pause tracking |
| `/cost on` | Resume tracking |
| `/cost reset` | Clear the log for this project |

## How it works

A Stop hook fires after each turn and parses the session transcript to extract token usage (input, output, cache write, cache read) per API call. Usage is logged per-project, identified by git remote or directory name.

`/cost report` displays:
- Summary table grouped by model tier (opus, sonnet, haiku)
- Sub-agent call count and cost
- Budget variance (under/over)
- Cumulative cost chart with budget line (terminal-width responsive)

Multiple Claude Code sessions in different repos track independently.

## Log location

Logs are stored in `~/.claude/cost-logs/` — one `.jsonl` file per project plus a `state.json` for tracking offsets and budgets. This location survives plugin reinstalls.

## Model Pricing

Pricing is configured in `config/modelcost.json` (per million tokens):

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| Haiku | $0.80 | $4.00 | $1.00 | $0.08 |
| Sonnet | $3.00 | $15.00 | $3.75 | $0.30 |
| Opus | $15.00 | $75.00 | $18.75 | $1.50 |

Edit this file to update pricing when rates change.

## License

MIT
