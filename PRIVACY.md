# Privacy Policy

**ck-costmanager** respects your privacy. This document describes what data the plugin collects, where it is stored, and how it is used.

## Data collected

The plugin extracts the following from your local Claude Code session transcripts:

- **Timestamp** of each API response
- **Username** from `git config user.name` (falls back to OS username)
- **Model tier** used (opus, sonnet, haiku)
- **Token counts**: input, output, cache write, cache read
- **Agent type**: whether the call was from the main agent or a sub-agent

The plugin also derives a **project identifier** from your git remote URL (e.g. `user/repo`) or working directory path to separate logs per project.

## Data NOT collected

- No conversation content, prompts, or responses
- No file paths, code, or filenames from your project
- No email addresses or API keys
- No data is transmitted to any external server or third party

## Where data is stored

By default, all data remains on your local machine:

```
~/.claude/cost-logs/<project>.jsonl   # token usage entries
~/.claude/cost-logs/state.json        # tracking offsets and budget settings
```

If you set the `CLAUDE_COST_LOG_DIR` environment variable to a shared directory (for team usage), logs are written there instead. This is an opt-in choice by the user.

## Data retention

Log files persist until you explicitly clear them with `/ckcost reset` or manually delete `~/.claude/cost-logs/`.

## Network access

This plugin makes **zero network requests**. It only reads local transcript files and writes to the local filesystem.

## Third-party services

None. No analytics, telemetry, or external APIs are used.

## Changes

If data handling changes in a future version, this document will be updated accordingly.
