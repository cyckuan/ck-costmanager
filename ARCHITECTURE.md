# Architecture

## Determinism

This plugin is designed to minimise LLM involvement. All logic executes as deterministic code.

### Fully deterministic (code)

| Component | Mechanism |
|-----------|-----------|
| Token logging | Stop hook runs `node cost.js log` — pure command, no LLM |
| Transcript parsing | Regex + JSON parse in Node.js |
| Cost calculation | Arithmetic from `modelcost.json` rates |
| Project identification | `git remote get-url origin` with regex extraction |
| Budget tracking | JSON state file read/write |
| Report rendering | Deterministic string formatting + ANSI codes |
| Chart rendering | Deterministic cumulative bucketing algorithm |

### LLM-dependent (unavoidable)

| Component | What the LLM does | Risk |
|-----------|-------------------|------|
| `/ckcost` command dispatch | Reads `commands/ckcost.md`, runs `node cost.js $ARGUMENTS` | LLM must correctly pass user arguments to bash |

The slash command `.md` file is the only LLM touchpoint. It instructs Claude to run a single bash command and display output. The instruction is minimal to reduce interpretation variance.

### Why the command file exists

Claude Code's plugin system requires a `.md` file for slash commands — there is no "pure code" command registration. The `.md` content is a prompt that the LLM interprets when the user invokes `/ckcost`. This is an unavoidable platform constraint.

### Mitigations

- Command file contains no conditional logic or decision-making prose
- All argument parsing happens in `cost.js`, not in the prompt
- `$ARGUMENTS` is passed as-is (shell-split by bash, not by the LLM)
- Invalid arguments produce a usage message from code, not LLM improvisation
- The hook (which handles all logging) is 100% code — no LLM in the critical path

## Data flow

```
Session transcript (.jsonl)
         │
         ▼
[Stop hook fires] ─── stdin: {transcript_path, cwd, session_id}
         │
         ▼
cost.js log ─── reads transcript, deduplicates by msg ID
         │
         ▼
~/.claude/cost-logs/<project>.jsonl  (append-only)
         │
         ▼
cost.js report ─── reads log, computes costs, renders chart
         │
         ▼
stdout (displayed to user)
```

## File layout

```
scripts/cost.js        # All logic — single file, zero dependencies
config/modelcost.json  # Pricing rates (user-editable)
hooks/hooks.json       # Stop hook registration (deterministic command)
commands/ckcost.md       # Slash command prompt (only LLM touchpoint)
```
