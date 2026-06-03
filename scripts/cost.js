#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PLUGIN_ROOT = process.env.CLAUDE_PLUGIN_ROOT || path.resolve(__dirname, '..');
const COST_PATH = path.join(PLUGIN_ROOT, 'config', 'modelcost.json');
const COLORS_PATH = path.join(PLUGIN_ROOT, 'config', 'colors.json');
const LOG_DIR = process.env.CLAUDE_COST_LOG_DIR || path.join(os.homedir(), '.claude', 'cost-logs');
const STATE_PATH = path.join(LOG_DIR, 'state.json');
const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const DEFAULT_BUDGET = 10;

// ─── THEME DETECTION ──────────────────────────────────────────────────────────
function detectTheme() {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    const theme = settings.theme || '';
    return /light/i.test(theme) ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function loadColorScheme() {
  const mode = detectTheme();
  const esc = (code) => code ? `\x1b${code}` : '';

  try {
    const raw = JSON.parse(fs.readFileSync(COLORS_PATH, 'utf8'));
    const scheme = raw[mode] || raw.dark;
    return {
      reset: esc(scheme.reset),
      header: esc(scheme.header),
      dim: esc(scheme.dim),
      border: esc(scheme.border),
      grid: esc(scheme.grid),
      label: esc(scheme.label),
      budgetLine: esc(scheme.budget_line),
      budgetText: esc(scheme.budget_text),
      marker: esc(scheme.marker),
      rate: esc(scheme.rate),
      sparkLabel: esc(scheme.spark_label),
      tierOpus: esc(scheme.tier?.opus),
      tierSonnet: esc(scheme.tier?.sonnet),
      tierHaiku: esc(scheme.tier?.haiku),
      gradLow: esc(scheme.gradient?.low),
      gradMid: esc(scheme.gradient?.mid),
      gradHigh: esc(scheme.gradient?.high),
      gradOver: esc(scheme.gradient?.over),
      sessionBound: esc(scheme.session_bound),
      underBudget: esc(scheme.under_budget),
      overBudget: esc(scheme.over_budget),
    };
  } catch {
    const isDark = mode === 'dark';
    return {
      reset: '\x1b[0m',
      header: isDark ? '\x1b[1;97m' : '\x1b[1;30m',
      dim: isDark ? '\x1b[2m' : '\x1b[90m',
      border: isDark ? '\x1b[2m' : '\x1b[90m',
      grid: isDark ? '\x1b[2m' : '\x1b[37m',
      label: isDark ? '\x1b[97m' : '\x1b[30m',
      budgetLine: '\x1b[33m',
      budgetText: '\x1b[33m',
      marker: isDark ? '\x1b[1;97m' : '\x1b[1;30m',
      rate: isDark ? '\x1b[2m' : '\x1b[90m',
      sparkLabel: isDark ? '\x1b[2m' : '\x1b[90m',
      tierOpus: isDark ? '\x1b[35m' : '\x1b[1;35m',
      tierSonnet: isDark ? '\x1b[34m' : '\x1b[1;34m',
      tierHaiku: isDark ? '\x1b[32m' : '\x1b[1;32m',
      gradLow: '\x1b[32m',
      gradMid: '\x1b[33m',
      gradHigh: '\x1b[38;5;208m',
      gradOver: isDark ? '\x1b[31m' : '\x1b[1;31m',
      sessionBound: isDark ? '\x1b[2m' : '\x1b[37m',
      underBudget: '\x1b[32m',
      overBudget: isDark ? '\x1b[1;31m' : '\x1b[1;31m',
    };
  }
}

const c = loadColorScheme();

// ─── USER IDENTITY ────────────────────────────────────────────────────────────
function getUsername() {
  try {
    return execSync('git config user.name', {
      encoding: 'utf8',
      timeout: 2000,
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
  } catch {
    return os.userInfo().username || 'unknown';
  }
}

// ─── PROJECT IDENTITY ──────────────────────────────────────────────────────────
function getProjectId(cwd) {
  const dir = cwd || process.cwd();
  try {
    const remote = execSync('git remote get-url origin', {
      cwd: dir,
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
    return dir;
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
    console.log(`${c.budgetText}Cost tracking is already on for ${c.header}${projectId}${c.reset}`);
    return;
  }

  ps.enabled = true;
  saveState(state);
  console.log(`${c.underBudget}Cost tracking resumed${c.reset} for ${c.header}${projectId}${c.reset}`);
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
    console.log(`Current budget for ${c.header}${projectId}${c.reset}: ${c.budgetText}$${ps.budget.toFixed(2)}${c.reset}`);
    return;
  }
  ps.budget = val;
  saveState(state);
  console.log(`${c.underBudget}Budget set to ${c.budgetText}$${val.toFixed(2)}${c.reset} for ${c.header}${projectId}${c.reset}`);
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
  console.log(`${c.underBudget}Cost log cleared${c.reset} for ${c.header}${projectId}${c.reset}`);
}

// ─── REPORT ────────────────────────────────────────────────────────────────────
function cmdReport() {
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const projectId = getProjectId(cwd);
  const logPath = getLogPath(projectId);

  if (!fs.existsSync(logPath)) {
    console.log(`${c.budgetText}No usage data yet for ${c.header}${projectId}${c.reset}. Tracking starts automatically.`);
    return;
  }

  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  if (lines.length === 0) {
    console.log(`${c.budgetText}No usage data recorded yet for ${c.header}${projectId}${c.reset}.`);
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
  console.log(`  ${c.header}Cost Report${c.reset}  ${c.dim}─${c.reset}  ${c.header}${projectId}${c.reset}`);
  console.log(`  ${c.border}${'─'.repeat(58)}${c.reset}`);

  // Table header
  console.log(`  ${c.border}${padRight('Model', 10)}│ ${padRight('Input', 9)}│ ${padRight('Output', 9)}│ ${padRight('Cache', 9)}│ ${padRight('Cost', 8)}${c.reset}`);
  console.log(`  ${c.border}${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(9)}${c.reset}`);

  const tierColor = { opus: c.tierOpus, sonnet: c.tierSonnet, haiku: c.tierHaiku };
  const tiers = ['opus', 'sonnet', 'haiku'];

  for (const tier of tiers) {
    const m = byModel[tier];
    if (!m) continue;
    const cache = m.cacheWrite + m.cacheRead;
    const tc = tierColor[tier] || c.label;
    console.log(`  ${tc}${padRight(tier, 10)}${c.reset}${c.border}│${c.reset} ${padRight(formatTokens(m.input), 9)}${c.border}│${c.reset} ${padRight(formatTokens(m.output), 9)}${c.border}│${c.reset} ${padRight(formatTokens(cache), 9)}${c.border}│${c.reset} ${padLeft(c.label + '$' + m.cost.toFixed(2) + c.reset, 8)}`);
  }

  console.log(`  ${c.border}${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(10)}┼${'─'.repeat(9)}${c.reset}`);

  const allInput = Object.values(byModel).reduce((s, m) => s + m.input, 0);
  const allOutput = Object.values(byModel).reduce((s, m) => s + m.output, 0);
  const allCache = Object.values(byModel).reduce((s, m) => s + m.cacheWrite + m.cacheRead, 0);
  console.log(`  ${c.header}${padRight('Total', 10)}${c.reset}${c.border}│${c.reset} ${padRight(formatTokens(allInput), 9)}${c.border}│${c.reset} ${padRight(formatTokens(allOutput), 9)}${c.border}│${c.reset} ${padRight(formatTokens(allCache), 9)}${c.border}│${c.reset} ${padLeft(c.header + '$' + totalCost.toFixed(2) + c.reset, 8)}`);

  if (subagentCalls > 0) {
    console.log('');
    console.log(`  ${c.tierOpus}Agents:${c.reset} ${subagentCalls} sub-agent calls (${c.budgetText}$${subagentCost.toFixed(2)}${c.reset})`);
  }

  // Budget variance
  const variance = budget - totalCost;
  console.log('');
  if (variance >= 0) {
    console.log(`  ${c.dim}Budget:${c.reset} ${c.budgetText}$${budget.toFixed(2)}${c.reset}  ${c.border}│${c.reset}  ${c.underBudget}Under budget by $${variance.toFixed(2)}${c.reset}`);
  } else {
    console.log(`  ${c.dim}Budget:${c.reset} ${c.budgetText}$${budget.toFixed(2)}${c.reset}  ${c.border}│${c.reset}  ${c.overBudget}OVER budget by $${Math.abs(variance).toFixed(2)}${c.reset}`);
  }

  if (timeBuckets.length > 1) {
    renderCumulativeChart(timeBuckets, budget, totalCost);
  }

  console.log('');
}

function gradientColor(norm, budgetNorm) {
  if (norm > budgetNorm) return c.gradOver;
  const ratio = norm / budgetNorm;
  if (ratio < 0.5) return c.gradLow;
  if (ratio < 0.8) return c.gradMid;
  return c.gradHigh;
}

function detectSessionBoundaries(sorted, numSlots, span, startTs) {
  if (span === 0 || sorted.length < 2) return new Set();
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    gaps.push({ idx: i, gap: sorted[i].ts - sorted[i - 1].ts });
  }
  const avgGap = span / sorted.length;
  const threshold = Math.max(avgGap * 3, 60000);
  const boundaries = new Set();
  for (const { idx, gap } of gaps) {
    if (gap > threshold) {
      const slot = Math.min(numSlots - 1, Math.floor(((sorted[idx].ts - startTs) / span) * numSlots));
      boundaries.add(slot);
    }
  }
  return boundaries;
}

function renderSparkline(cumulative, maxVal, budgetNorm) {
  const SPARKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const line = cumulative.map(v => {
    const norm = v / maxVal;
    const idx = Math.min(SPARKS.length - 1, Math.max(0, Math.floor(norm * SPARKS.length)));
    const color = gradientColor(norm, budgetNorm);
    return `${color}${SPARKS[idx]}${c.reset}`;
  }).join('');
  return line;
}

function renderCumulativeChart(buckets, budget, totalCost) {
  const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const SUB_LEVELS = BLOCKS.length - 1;
  const CHART_ROWS = 8;
  const termCols = process.stdout.columns || 80;
  const CHART_WIDTH = Math.min(60, Math.max(20, termCols - 22));

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

  const sessionBounds = detectSessionBoundaries(sorted, numSlots, span, startTs);

  // Current spend marker row
  const spendNorm = totalCost / maxVal;
  const spendRow = CHART_ROWS - 1 - Math.floor(spendNorm * CHART_ROWS);
  const spendRowClamped = Math.max(0, Math.min(CHART_ROWS - 1, spendRow));

  // Y-axis label rows: 25%, 50%, 75%
  const yLabels = new Map();
  for (const pct of [0.25, 0.50, 0.75]) {
    const val = maxVal * pct;
    const row = CHART_ROWS - 1 - Math.floor(pct * CHART_ROWS);
    const rowClamped = Math.max(0, Math.min(CHART_ROWS - 1, row));
    if (rowClamped !== 0 && rowClamped !== budgetRowClamped) {
      yLabels.set(rowClamped, val);
    }
  }

  console.log('');
  console.log(`  ${c.header}Cumulative cost${c.reset}`);

  for (let row = 0; row < CHART_ROWS; row++) {
    const rowBottom = (CHART_ROWS - 1 - row) / CHART_ROWS;
    const rowTop = (CHART_ROWS - row) / CHART_ROWS;

    // Build each column character with per-cell color
    let rowStr = '';
    for (let col = 0; col < numSlots; col++) {
      const norm = cumulative[col] / maxVal;
      const isSessionBound = sessionBounds.has(col);

      if (norm <= rowBottom) {
        // Empty cell — dot grid or session marker
        if (isSessionBound) {
          rowStr += `${c.sessionBound}╎${c.reset}`;
        } else {
          rowStr += `${c.grid}·${c.reset}`;
        }
      } else {
        const cellColor = gradientColor(norm, budgetNorm);
        if (norm >= rowTop) {
          rowStr += `${cellColor}${BLOCKS[SUB_LEVELS]}${c.reset}`;
        } else {
          const partial = (norm - rowBottom) / (rowTop - rowBottom);
          const idx = Math.max(1, Math.round(partial * SUB_LEVELS));
          rowStr += `${cellColor}${BLOCKS[idx]}${c.reset}`;
        }
      }
    }

    let leftLabel = '';
    let lineChar = '│';
    let rightAnnotation = '';

    if (row === 0) {
      leftLabel = padLeft('$' + maxVal.toFixed(2), 7);
      lineChar = '┤';
      rightAnnotation = `${c.border}┐${c.reset}`;
    } else if (row === budgetRowClamped) {
      leftLabel = padLeft('$' + budget.toFixed(2), 7);
      lineChar = '┤';
      const budgetLine = Array.from({ length: numSlots }, (_, col) => {
        const norm = cumulative[col] / maxVal;
        if (norm > budgetNorm) return `${c.budgetLine}═${c.reset}`;
        return `${c.budgetLine}╌${c.reset}`;
      }).join('');
      const marker = row === spendRowClamped ? `${c.marker}◆${c.reset}` : `${c.border}┤${c.reset}`;
      console.log(`  ${c.border}${leftLabel} ${lineChar}${c.reset}${budgetLine}${marker} ${c.budgetText}budget${c.reset}`);
      continue;
    } else if (yLabels.has(row)) {
      const val = yLabels.get(row);
      leftLabel = padLeft('$' + val.toFixed(2), 7);
      lineChar = '┤';
      rightAnnotation = row === spendRowClamped
        ? `${c.marker}◆${c.reset}`
        : `${c.border}┤${c.reset}`;
    } else {
      leftLabel = ' '.repeat(7);
      rightAnnotation = row === spendRowClamped
        ? `${c.marker}◆${c.reset}`
        : `${c.border}│${c.reset}`;
    }

    console.log(`  ${c.border}${leftLabel} ${lineChar}${c.reset}${rowStr}${rightAnnotation}`);
  }

  // Bottom axis
  console.log(`  ${c.border}${padLeft('$0', 7)} ┤${'─'.repeat(numSlots)}┘${c.reset}`);

  // Time labels + rate indicator
  if (span > 0) {
    const startLabel = new Date(startTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const endLabel = new Date(endTs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const hours = span / 3_600_000;
    const rate = hours > 0 ? totalCost / hours : 0;
    const rateStr = `${c.rate}${rate.toFixed(2)}$/hr${c.reset}`;
    const rateVisible = rate.toFixed(2).length + 4; // "X.XX$/hr"
    const gap = Math.max(1, numSlots - startLabel.length - endLabel.length - rateVisible - 1);
    console.log(`  ${c.dim}${' '.repeat(8)}${startLabel}${' '.repeat(gap)}${endLabel}  ${c.reset}${rateStr}`);
  }

  // Compact sparkline
  const pctUsed = Math.min(100, Math.round((totalCost / budget) * 100));
  const spark = renderSparkline(cumulative, maxVal, budgetNorm);
  console.log(`  ${c.sparkLabel}Spark:${c.reset} ${spark} ${c.sparkLabel}${pctUsed}% of budget${c.reset}`);
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

      const resolvedTranscript = path.resolve(transcriptPath);
      const claudeDir = path.join(os.homedir(), '.claude');
      if (!resolvedTranscript.startsWith(claudeDir)) {
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
          user: getUsername(),
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

// ─── PROJECTS ─────────────────────────────────────────────────────────────────
function cmdProjects() {
  const state = loadState();
  const projects = state.projects || {};
  const ids = Object.keys(projects);

  if (ids.length === 0) {
    console.log(`${c.budgetText}No projects tracked yet.${c.reset}`);
    return;
  }

  const costs = loadCosts();
  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const currentId = getProjectId(cwd);

  const rows = [];
  let grandTotal = 0;

  for (const id of ids) {
    const ps = projects[id];
    const logPath = getLogPath(id);
    let totalCost = 0;
    let entries = 0;
    let lastTs = 0;

    if (fs.existsSync(logPath)) {
      const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      entries = lines.length;
      for (const line of lines) {
        let entry;
        try { entry = JSON.parse(line); } catch { continue; }
        const tier = entry.model || 'opus';
        const rates = costs[tier] || costs.opus;
        totalCost += (
          (entry.input || 0) * rates.input +
          (entry.output || 0) * rates.output +
          (entry.cacheWrite || 0) * rates.cacheWrite +
          (entry.cacheRead || 0) * rates.cacheRead
        ) / 1_000_000;
        if (entry.ts > lastTs) lastTs = entry.ts;
      }
    }

    grandTotal += totalCost;
    const budget = ps.budget || DEFAULT_BUDGET;
    const pct = Math.round((totalCost / budget) * 100);
    const isCurrent = id === currentId;

    rows.push({ id, totalCost, budget, pct, entries, lastTs, enabled: ps.enabled !== false, isCurrent });
  }

  rows.sort((a, b) => b.lastTs - a.lastTs);

  const COL_NAME = 32;
  const COL_COST = 10;
  const COL_BUDGET = 10;
  const COL_STATUS = 12;
  const TABLE_W = COL_NAME + 1 + COL_COST + 1 + COL_BUDGET + 1 + COL_STATUS;

  console.log('');
  console.log(`  ${c.header}All Projects${c.reset}  ${c.dim}(${rows.length} tracked)${c.reset}`);
  console.log(`  ${c.border}${'─'.repeat(TABLE_W)}${c.reset}`);
  console.log(`  ${c.border}${padRight('  Project', COL_NAME)}│${padRight(' Cost', COL_COST)}│${padRight(' Budget', COL_BUDGET)}│${padRight(' Status', COL_STATUS)}${c.reset}`);
  console.log(`  ${c.border}${'─'.repeat(COL_NAME)}┼${'─'.repeat(COL_COST)}┼${'─'.repeat(COL_BUDGET)}┼${'─'.repeat(COL_STATUS)}${c.reset}`);

  for (const row of rows) {
    let displayId = row.id;
    const maxNameLen = COL_NAME - 4;
    if (displayId.length > maxNameLen) {
      displayId = '…' + displayId.slice(-(maxNameLen - 1));
    }
    const nameColor = row.isCurrent ? c.header : c.dim;
    const prefix = row.isCurrent ? `${c.marker}▸${c.reset} ` : '  ';
    const nameField = `  ${prefix}${nameColor}${padRight(displayId, maxNameLen)}${c.reset}`;

    let statusColor, statusText;
    if (!row.enabled) {
      statusColor = c.dim;
      statusText = 'paused';
    } else if (row.pct > 100) {
      statusColor = c.overBudget;
      statusText = `${row.pct}% OVER`;
    } else if (row.pct > 80) {
      statusColor = c.gradHigh;
      statusText = `${row.pct}%`;
    } else {
      statusColor = c.underBudget;
      statusText = `${row.pct}%`;
    }

    const costStr = ' $' + row.totalCost.toFixed(2);
    const budgetStr = ' $' + row.budget.toFixed(2);

    console.log(`${nameField}${c.border}│${c.reset}${padRight(costStr, COL_COST)}${c.border}│${c.reset}${padRight(budgetStr, COL_BUDGET)}${c.border}│${c.reset} ${statusColor}${statusText}${c.reset}`);
  }

  console.log(`  ${c.border}${'─'.repeat(COL_NAME)}┼${'─'.repeat(COL_COST)}┼${'─'.repeat(COL_BUDGET)}┼${'─'.repeat(COL_STATUS)}${c.reset}`);
  console.log(`  ${c.header}${padRight('  Grand total', COL_NAME)}${c.reset}${c.border}│${c.reset}${padRight(' $' + grandTotal.toFixed(2), COL_COST)}${c.border}│${c.reset}`);
  console.log('');

  if (rows.length > 0) {
    const lastActive = rows.find(r => r.lastTs > 0);
    if (lastActive && lastActive.lastTs > 0) {
      const ago = formatTimeAgo(lastActive.lastTs);
      console.log(`  ${c.dim}Last activity: ${ago} (${lastActive.id})${c.reset}`);
    }
  }
  console.log('');
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
const cmd = process.argv[2] || 'report';

switch (cmd) {
  case 'on': cmdOn(); break;
  case 'off': cmdOff(); break;
  case 'reset': cmdReset(); break;
  case 'budget': cmdBudget(process.argv[3]); break;
  case 'report': cmdReport(); break;
  case 'projects': cmdProjects(); break;
  case 'log': cmdLog(); break;
  default:
    console.log(`Usage: /cost ${c.header}report${c.reset} | ${c.header}projects${c.reset} | ${c.budgetText}budget${c.reset} <USD> | ${c.gradOver}off${c.reset} | ${c.underBudget}on${c.reset} | reset`);
}
