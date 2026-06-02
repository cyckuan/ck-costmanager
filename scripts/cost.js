#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const COST_PATH = path.join(PLUGIN_ROOT, 'config', 'modelcost.json');
const LOG_DIR = path.join(os.homedir(), '.claude', 'cost-logs');
const STATE_PATH = path.join(LOG_DIR, 'state.json');
const DEFAULT_BUDGET = 10;

// ─── ANSI COLOURS ──────────────────────────────────────────────────────────────
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[97m',
  grey: '\x1b[90m',
};

// ─── PROJECT IDENTITY ──────────────────────────────────────────────────────────
function getProjectId(cwd) {
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    const sshMatch = remote.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
    if (sshMatch) return sshMatch[1];
    const httpsMatch = remote.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
    if (httpsMatch) return httpsMatch[1];
    return remote;
  } catch {
    return path.basename(cwd || process.cwd());
  }
}

function getLogPath(projectId) {
  const safe = projectId.replace(/[^a-zA-Z0-9_\-]/g, '_');
  return path.join(LOG_DIR, `${safe}.jsonl`);
}

// ─── STATE ─────────────────────────────────────────────────────────────────────
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return { projects: {} }; }
}

function saveState(state) {
  ensureLogDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

function getProjectState(state, projectId) {
  if (!state.projects) state.projects = {};
  if (!state.projects[projectId]) {
    state.projects[projectId] = { enabled: true, budget: DEFAULT_BUDGET, lastOffset: 0 };
  }
  return state.projects[projectId];
}

// ─── UTILITIES ─────────────────────────────────────────────────────────────────
function loadCosts() {
  try { return JSON.parse(fs.readFileSync(COST_PATH, 'utf8')); }
  catch {
    return {
      haiku: { input: 0.80, output: 4.00, cacheWrite: 1.00, cacheRead: 0.08 },
      sonnet: { input: 3.00, output: 15.00, cacheWrite: 3.75, cacheRead: 0.30 },
      opus: { input: 15.00, output: 75.00, cacheWrite: 18.75, cacheRead: 1.50 }
    };
  }
}

function detectTier(modelId) {
  if (!modelId) return 'opus';
  const id = modelId.toLowerCase();
  if (id.includes('haiku')) return 'haiku';
  if (id.includes('sonnet')) return 'sonnet';
  return 'opus';
}

function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

function padRight(str, len) {
  const visible = str.replace(/\x1b\[[^m]*m/g, '');
  return str + ' '.repeat(Math.max(0, len - visible.length));
}

function padLeft(str, len) {
  const visible = str.replace(/\x1b\[[^m]*m/g, '');
  return ' '.repeat(Math.max(0, len - visible.length)) + str;
}

// ─── ON ────────────────────────────────────────────────────────────────────────
function cmdOn() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectId = getProjectId(cwd);
  const state = loadState();
  const ps = getProjectState(state, projectId);

  if (ps.enabled) {
    console.log(`${c.yellow}Cost tracking is already on for ${c.cyan}${projectId}${c.reset}`);
    return;
  }

  ps.enabled = true;
  saveState(state);
  console.log(`${c.green}Cost tracking resumed${c.reset} for ${c.bold}${c.cyan}${projectId}${c.reset}`);
}

// ─── BUDGET ────────────────────────────────────────────────────────────────────
function cmdBudget(amount) {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectId = getProjectId(cwd);
  const state = loadState();
  const ps = getProjectState(state, projectId);

  const val = parseFloat(amount);
  if (isNaN(val) || val <= 0) {
    console.log(`Usage: /cost budget <amount in USD>`);
    console.log(`Current budget for ${c.cyan}${projectId}${c.reset}: ${c.yellow}$${ps.budget.toFixed(2)}${c.reset}`);
    return;
  }
  ps.budget = val;
  saveState(state);
  console.log(`${c.green}Budget set to ${c.yellow}$${val.toFixed(2)}${c.reset} for ${c.cyan}${projectId}${c.reset}`);
}

// ─── OFF ───────────────────────────────────────────────────────────────────────
function cmdOff() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectId = getProjectId(cwd);
  const state = loadState();
  const ps = getProjectState(state, projectId);

  ps.enabled = false;
  saveState(state);
  console.log(`${c.dim}Cost tracking paused for ${projectId}. Run /cost on to resume.${c.reset}`);
}

// ─── RESET ─────────────────────────────────────────────────────────────────────
function cmdReset() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectId = getProjectId(cwd);
  const logPath = getLogPath(projectId);
  const state = loadState();
  const ps = getProjectState(state, projectId);

  if (fs.existsSync(logPath)) fs.writeFileSync(logPath, '');
  ps.lastOffset = 0;
  saveState(state);
  console.log(`${c.green}Cost log cleared${c.reset} for ${c.cyan}${projectId}${c.reset}`);
}

// ─── REPORT ────────────────────────────────────────────────────────────────────
function cmdReport() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectId = getProjectId(cwd);
  const logPath = getLogPath(projectId);

  if (!fs.existsSync(logPath)) {
    console.log(`${c.yellow}No usage data yet for ${c.cyan}${projectId}${c.reset}. Tracking starts automatically.`);
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log(`${c.yellow}No usage data recorded yet for ${c.cyan}${projectId}${c.reset}.`);
    return;
  }

  const costs = loadCosts();
  const byModel = {};
  let totalCost = 0;
  let subagentCalls = 0;
  let subagentCost = 0;
  const timeBuckets = [];

  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    const tier = entry.model || 'opus';
    const rates = costs[tier] || costs.opus;

    if (!byModel[tier]) {
      byModel[tier] = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, cost: 0 };
    }

    byModel[tier].input += entry.input || 0;
    byModel[tier].output += entry.output || 0;
    byModel[tier].cacheWrite += entry.cacheWrite || 0;
    byModel[tier].cacheRead += entry.cacheRead || 0;

    const entryCost = (
      (entry.input || 0) * rates.input +
      (entry.output || 0) * rates.output +
      (entry.cacheWrite || 0) * rates.cacheWrite +
      (entry.cacheRead || 0) * rates.cacheRead
    ) / 1_000_000;

    byModel[tier].cost += entryCost;
    totalCost += entryCost;

    if (entry.isSubagent) {
      subagentCalls++;
      subagentCost += entryCost;
    }

    timeBuckets.push({ ts: entry.ts || 0, cost: entryCost });
  }

  const state = loadState();
  const ps = getProjectState(state, projectId);
  const budget = ps.budget || DEFAULT_BUDGET;

  // Header
  console.log('');
  console.log(`  ${c.bold}${c.white}Cost Report${c.reset}  ${c.dim}─${c.reset}  ${c.cyan}${projectId}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(58)}${c.reset}`);

  // Table header
  console.log(`  ${c.dim}${padRight('Model', 10)}│ ${padRight('Input', 9)}│ ${padRight('Output', 9)}│ ${padRight('Cache', 9)}│ ${padRight('Cost', 8)}${c.reset}`);
  console.log(`  ${c.dim}${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(9)}${c.reset}`);

  const tierColor = { opus: c.magenta, sonnet: c.blue, haiku: c.green };
  const tiers = ['opus', 'sonnet', 'haiku'];

  for (const tier of tiers) {
    const m = byModel[tier];
    if (!m) continue;
    const cache = m.cacheWrite + m.cacheRead;
    const tc = tierColor[tier] || c.white;
    console.log(`  ${tc}${padRight(tier, 10)}${c.reset}${c.dim}│${c.reset} ${padRight(formatTokens(m.input), 9)}${c.dim}│${c.reset} ${padRight(formatTokens(m.output), 9)}${c.dim}│${c.reset} ${padRight(formatTokens(cache), 9)}${c.dim}│${c.reset} ${padLeft(c.white + '$' + m.cost.toFixed(2) + c.reset, 8)}`);
  }

  console.log(`  ${c.dim}${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(9)}${c.reset}`);

  const allInput = Object.values(byModel).reduce((s, m) => s + m.input, 0);
  const allOutput = Object.values(byModel).reduce((s, m) => s + m.output, 0);
  const allCache = Object.values(byModel).reduce((s, m) => s + m.cacheWrite + m.cacheRead, 0);
  console.log(`  ${c.bold}${padRight('Total', 10)}${c.reset}${c.dim}│${c.reset} ${padRight(formatTokens(allInput), 9)}${c.dim}│${c.reset} ${padRight(formatTokens(allOutput), 9)}${c.dim}│${c.reset} ${padRight(formatTokens(allCache), 9)}${c.dim}│${c.reset} ${padLeft(c.bold + c.white + '$' + totalCost.toFixed(2) + c.reset, 8)}`);

  if (subagentCalls > 0) {
    console.log('');
    console.log(`  ${c.magenta}Agents:${c.reset} ${subagentCalls} sub-agent calls (${c.yellow}$${subagentCost.toFixed(2)}${c.reset})`);
  }

  // Budget variance
  const variance = budget - totalCost;
  console.log('');
  if (variance >= 0) {
    console.log(`  ${c.dim}Budget:${c.reset} ${c.yellow}$${budget.toFixed(2)}${c.reset}  ${c.dim}│${c.reset}  ${c.green}Under budget by $${variance.toFixed(2)}${c.reset}`);
  } else {
    console.log(`  ${c.dim}Budget:${c.reset} ${c.yellow}$${budget.toFixed(2)}${c.reset}  ${c.dim}│${c.reset}  ${c.bold}${c.red}OVER budget by $${Math.abs(variance).toFixed(2)}${c.reset}`);
  }

  if (timeBuckets.length > 1) {
    renderCumulativeChart(timeBuckets, budget, totalCost);
  }

  console.log('');
}

function renderCumulativeChart(buckets, budget, totalCost) {
  const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const SUB_LEVELS = BLOCKS.length - 1;
  const CHART_ROWS = 8;
  const LABEL_WIDTH = 10;
  const termCols = process.stdout.columns || 80;
  const CHART_WIDTH = Math.min(60, Math.max(20, termCols - LABEL_WIDTH - 12));

  const sorted = buckets.sort((a, b) => a.ts - b.ts);
  const startTs = sorted[0].ts;
  const endTs = sorted[sorted.length - 1].ts;
  const span = endTs - startTs;

  const numSlots = CHART_WIDTH;
  const slotCosts = new Array(numSlots).fill(0);

  if (span === 0) {
    slotCosts[0] = buckets.reduce((s, b) => s + b.cost, 0);
  } else {
    for (const b of sorted) {
      const idx = Math.min(numSlots - 1, Math.floor(((b.ts - startTs) / span) * numSlots));
      slotCosts[idx] += b.cost;
    }
  }

  const cumulative = [];
  let running = 0;
  for (const cost of slotCosts) {
    running += cost;
    cumulative.push(running);
  }

  const maxVal = Math.max(totalCost, budget) * 1.05;

  const budgetNorm = budget / maxVal;
  const budgetRow = CHART_ROWS - 1 - Math.floor(budgetNorm * CHART_ROWS);
  const budgetRowClamped = Math.max(0, Math.min(CHART_ROWS - 1, budgetRow));

  console.log('');
  console.log(`  ${c.bold}${c.white}Cumulative cost${c.reset}`);

  for (let row = 0; row < CHART_ROWS; row++) {
    const rowBottom = (CHART_ROWS - 1 - row) / CHART_ROWS;
    const rowTop = (CHART_ROWS - row) / CHART_ROWS;

    const rowChars = cumulative.map(v => {
      const norm = v / maxVal;
      if (norm <= rowBottom) return ' ';
      if (norm >= rowTop) return BLOCKS[SUB_LEVELS];
      const partial = (norm - rowBottom) / (rowTop - rowBottom);
      const idx = Math.max(1, Math.round(partial * SUB_LEVELS));
      return BLOCKS[idx];
    }).join('');

    const rowMidNorm = (rowBottom + rowTop) / 2;
    const barColor = rowMidNorm > budgetNorm ? c.red : c.green;

    let leftLabel = '';
    let lineChar = '│';
    let rightLabel = '│';

    if (row === 0) {
      leftLabel = padLeft('$' + maxVal.toFixed(2), 7);
      lineChar = '┤';
      rightLabel = '┐';
    } else if (row === budgetRowClamped) {
      leftLabel = padLeft('$' + budget.toFixed(2), 7);
      lineChar = '┤';
      console.log(`  ${c.dim}${leftLabel} ${lineChar}${c.yellow}${'╌'.repeat(numSlots)}${c.dim}┤${c.reset} ${c.yellow}budget${c.reset}`);
      continue;
    } else {
      leftLabel = ' '.repeat(7);
    }

    console.log(`  ${c.dim}${leftLabel} ${lineChar}${c.reset}${barColor}${rowChars}${c.dim}${rightLabel}${c.reset}`);
  }

  console.log(`  ${c.dim}${padLeft('$0', 7)} ┤${'─'.repeat(numSlots)}┘${c.reset}`);

  if (span > 0) {
    const startLabel = new Date(startTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endLabel = new Date(endTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const gap = Math.max(1, numSlots - startLabel.length - endLabel.length);
    console.log(`  ${c.dim}${' '.repeat(8)}${startLabel}${' '.repeat(gap)}${endLabel}${c.reset}`);
  }
}

// ─── LOG (called by Stop hook via stdin) ───────────────────────────────────────
function cmdLog() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    try {
      const data = JSON.parse(input);
      const cwd = data.cwd || process.cwd();
      const projectId = getProjectId(cwd);

      const state = loadState();
      const ps = getProjectState(state, projectId);

      if (!ps.enabled) {
        process.stdout.write('{"decision":"approve"}');
        process.exit(0);
      }

      const transcriptPath = data.transcript_path;
      if (!transcriptPath || !fs.existsSync(transcriptPath)) {
        process.stdout.write('{"decision":"approve"}');
        process.exit(0);
      }

      ensureLogDir();
      const logPath = getLogPath(projectId);

      const content = fs.readFileSync(transcriptPath, 'utf8');
      const tLines = content.trim().split('\n');

      const lastOffset = ps.lastOffset || 0;
      const newLines = tLines.slice(lastOffset);

      const seen = new Set();
      const mainSessionId = data.session_id;

      for (const tLine of newLines) {
        let obj;
        try { obj = JSON.parse(tLine); } catch { continue; }

        if (obj.type !== 'assistant' || !obj.message?.usage) continue;

        const msgId = obj.message.id;
        if (!msgId || seen.has(msgId)) continue;
        seen.add(msgId);

        const usage = obj.message.usage;
        const modelId = obj.message.model || '';
        const tier = detectTier(modelId);
        const isSubagent = mainSessionId && obj.sessionId && obj.sessionId !== mainSessionId;

        const entry = {
          ts: obj.timestamp ? new Date(obj.timestamp).getTime() : 0,
          model: tier,
          input: usage.input_tokens || 0,
          output: usage.output_tokens || 0,
          cacheWrite: usage.cache_creation_input_tokens || 0,
          cacheRead: usage.cache_read_input_tokens || 0,
          isSubagent: !!isSubagent
        };

        fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
      }

      ps.lastOffset = tLines.length;
      saveState(state);
    } catch (e) {
      // Silent failure
    }
    process.stdout.write('{"decision":"approve"}');
  });
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
const cmd = process.argv[2] || 'report';

switch (cmd) {
  case 'on': cmdOn(); break;
  case 'off': cmdOff(); break;
  case 'reset': cmdReset(); break;
  case 'budget': cmdBudget(process.argv[3]); break;
  case 'report': cmdReport(); break;
  case 'log': cmdLog(); break;
  default:
    console.log(`Usage: /cost ${c.cyan}report${c.reset} | ${c.yellow}budget${c.reset} <USD> | ${c.red}off${c.reset} | ${c.green}on${c.reset} | reset`);
}
