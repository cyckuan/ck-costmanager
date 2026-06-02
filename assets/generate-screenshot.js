#!/usr/bin/env node
'use strict';

const { createCanvas, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

const FONT_PATH = path.join(
  process.env.HOME || '',
  '.claude/plugins/marketplaces/anthropic-agent-skills/skills/canvas-design/canvas-fonts'
);

registerFont(path.join(FONT_PATH, 'JetBrainsMono-Regular.ttf'), { family: 'JetBrains Mono' });
registerFont(path.join(FONT_PATH, 'JetBrainsMono-Bold.ttf'), { family: 'JetBrains Mono', weight: 'bold' });

const FONT_SIZE = 13;
const LINE_HEIGHT = 19;
const REPORT_PAD_X = 40;
const PAD_Y = 32;
const CALLOUT_MARGIN = 330;

const COLORS = {
  bg: '#FFFFFF',
  text: '#1e1e1e',
  dim: '#6e7681',
  border: '#8b949e',
  grid: '#d0d7de',
  header: '#1e1e1e',
  opus: '#8b5cf6',
  sonnet: '#3b82f6',
  haiku: '#10b981',
  gradLow: '#10b981',
  gradMid: '#ca8a04',
  gradHigh: '#ea580c',
  gradOver: '#dc2626',
  budget: '#ea580c',
  underBudget: '#16a34a',
  overBudget: '#dc2626',
  marker: '#1e1e1e',
  rate: '#6e7681',
  callout: '#475569',
  calloutLine: '#94a3b8',
  calloutDot: '#64748b',
};

function buildReportLines() {
  const lines = [];
  const h = (t) => ({ text: t, color: COLORS.header, bold: true });
  const d = (t) => ({ text: t, color: COLORS.dim });
  const b = (t) => ({ text: t, color: COLORS.border });
  const n = (t) => ({ text: t, color: COLORS.text });
  const opus = (t) => ({ text: t, color: COLORS.opus });
  const sonnet = (t) => ({ text: t, color: COLORS.sonnet });
  const haiku = (t) => ({ text: t, color: COLORS.haiku });
  const budget = (t) => ({ text: t, color: COLORS.budget });
  const over = (t) => ({ text: t, color: COLORS.overBudget, bold: true });

  lines.push([]);
  lines.push([h('  Cost Report'), d('  ─  '), h('cyckuan/ck-costmanager')]);
  lines.push([b('  ──────────────────────────────────────────────────────────')]);
  lines.push([b('  Model     │ Input    │ Output   │ Cache    │ Cost    ')]);
  lines.push([b('  ──────────┼──────────┼──────────┼──────────┼─────────')]);
  lines.push([opus('  opus      '), b('│'), n(' 590.0k   '), b('│'), n(' 205.0k   '), b('│'), n(' 1.1M     '), b('│'), n('   $28.02')]);
  lines.push([sonnet('  sonnet    '), b('│'), n(' 55.0k    '), b('│'), n(' 15.0k    '), b('│'), n(' 119.0k   '), b('│'), n('    $0.46')]);
  lines.push([haiku('  haiku     '), b('│'), n(' 20.0k    '), b('│'), n(' 5.0k     '), b('│'), n(' 42.0k    '), b('│'), n('    $0.04')]);
  lines.push([b('  ──────────┼──────────┼──────────┼──────────┼─────────')]);
  lines.push([h('  Total     '), b('│'), n(' 665.0k   '), b('│'), n(' 225.0k   '), b('│'), n(' 1.3M     '), b('│'), h('   $28.51')]);
  lines.push([]);
  lines.push([opus('  Agents: '), n('3 sub-agent calls ('), budget('$0.50'), n(')')]);
  lines.push([]);
  lines.push([d('  Budget: '), budget('$10.00'), d('  │  '), over('OVER budget by $18.51')]);
  lines.push([]);
  lines.push([h('  Cumulative cost')]);

  const CHART_W = 50;

  function gridDot() { return { text: '·', color: COLORS.grid }; }
  function sessionDot() { return { text: '╎', color: COLORS.dim }; }
  function block(ch, color) { return { text: ch, color }; }

  const cumVals = [];
  for (let i = 0; i < CHART_W; i++) {
    const t = i / (CHART_W - 1);
    cumVals.push(28.51 * Math.pow(t, 0.6));
  }
  const maxVal = 29.94;
  const budgetNorm = 10 / maxVal;

  function getGradColor(norm) {
    if (norm > budgetNorm) return COLORS.gradOver;
    const ratio = norm / budgetNorm;
    if (ratio < 0.5) return COLORS.gradLow;
    if (ratio < 0.8) return COLORS.gradMid;
    return COLORS.gradHigh;
  }

  const BLOCKS = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
  const CHART_ROWS = 8;
  const sessionCol = 40;

  for (let row = 0; row < CHART_ROWS; row++) {
    const rowBottom = (CHART_ROWS - 1 - row) / CHART_ROWS;
    const rowTop = (CHART_ROWS - row) / CHART_ROWS;

    const budgetRow = CHART_ROWS - 1 - Math.floor(budgetNorm * CHART_ROWS);
    if (row === Math.max(0, Math.min(CHART_ROWS - 1, budgetRow))) {
      const cells = [];
      for (let col = 0; col < CHART_W; col++) {
        const norm = cumVals[col] / maxVal;
        if (norm > budgetNorm) {
          cells.push({ text: '═', color: COLORS.budget });
        } else {
          cells.push({ text: '╌', color: COLORS.budget });
        }
      }
      const lbl = padL('$10.00', 7);
      lines.push([b(`  ${lbl} ┤`), ...cells, b('┤'), { text: ' budget', color: COLORS.budget }]);
      continue;
    }

    const cells = [];
    for (let col = 0; col < CHART_W; col++) {
      const norm = cumVals[col] / maxVal;
      if (norm <= rowBottom) {
        if (col === sessionCol) cells.push(sessionDot());
        else cells.push(gridDot());
      } else {
        const color = getGradColor(norm);
        if (norm >= rowTop) {
          cells.push(block('█', color));
        } else {
          const partial = (norm - rowBottom) / (rowTop - rowBottom);
          const idx = Math.max(1, Math.round(partial * 8));
          cells.push(block(BLOCKS[Math.min(8, idx)], color));
        }
      }
    }

    let lbl, lc, rc;
    if (row === 0) {
      lbl = padL('$29.94', 7);
      lc = '┤';
      rc = b('┐');
    } else {
      const pctRow25 = CHART_ROWS - 1 - Math.floor(0.25 * CHART_ROWS);
      const pctRow50 = CHART_ROWS - 1 - Math.floor(0.50 * CHART_ROWS);
      const pctRow75 = CHART_ROWS - 1 - Math.floor(0.75 * CHART_ROWS);
      if (row === pctRow25) { lbl = padL('$7.49', 7); lc = '┤'; rc = b('┤'); }
      else if (row === pctRow50) { lbl = padL('$14.97', 7); lc = '┤'; rc = b('┤'); }
      else if (row === pctRow75) { lbl = padL('$22.45', 7); lc = '┤'; rc = b('┤'); }
      else { lbl = '       '; lc = '│'; rc = b('│'); }
    }

    if (row === 1) {
      rc = { text: '◆', color: COLORS.marker, bold: true };
    }

    lines.push([b(`  ${lbl} ${lc}`), ...cells, rc]);
  }

  lines.push([b(`  ${padL('$0', 7)} ┤${'─'.repeat(CHART_W)}┘`)]);
  lines.push([d('          02:15 PM'), d(' '.repeat(CHART_W - 22)), d('04:01 PM  '), { text: '16.29$/hr', color: COLORS.rate }]);

  const sparkChars = cumVals.map(v => {
    const norm = v / maxVal;
    const idx = Math.min(7, Math.max(0, Math.floor(norm * 8)));
    return { text: BLOCKS[idx + 1], color: getGradColor(norm) };
  });
  lines.push([d('  Spark: '), ...sparkChars, d(' 100% of budget')]);
  lines.push([]);

  return lines;
}

function padL(str, len) {
  return ' '.repeat(Math.max(0, len - str.length)) + str;
}

function measureLine(ctx, segments) {
  let width = 0;
  for (const seg of segments) {
    ctx.font = seg.bold ? `bold ${FONT_SIZE}px "JetBrains Mono"` : `${FONT_SIZE}px "JetBrains Mono"`;
    width += ctx.measureText(seg.text).width;
  }
  return width;
}

// Callout definitions: {line, label, side: 'right'|'left', offsetY?}
// line = 0-based index into reportLines
const CALLOUTS = [
  { line: 1, label: 'Project identity (from git remote)', side: 'right' },
  { line: 5, label: 'Per-model token breakdown & cost', side: 'right' },
  { line: 11, label: 'Sub-agent cost tracking', side: 'right' },
  { line: 13, label: 'Budget variance (under/over)', side: 'right' },
  { line: 16, label: 'Dot-grid background', side: 'right', offsetY: 10 },
  { line: 18, label: 'Color gradient (green→yellow→orange→red)', side: 'right' },
  { line: 20, label: 'Budget threshold line', side: 'right' },
  { line: 19, label: 'Session boundary marker ╎', side: 'right', offsetY: 10 },
  { line: 21, label: 'Y-axis labels (25/50/75%)', side: 'right', offsetY: 10 },
  { line: 17, label: 'Current spend ◆', side: 'right', offsetY: 10 },
  { line: 25, label: 'Burn rate ($/hr)', side: 'right' },
  { line: 26, label: 'Compact sparkline + budget %', side: 'right' },
];

function render() {
  const reportLines = buildReportLines();

  const tmpCanvas = createCanvas(1, 1);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = `${FONT_SIZE}px "JetBrains Mono"`;

  let maxWidth = 0;
  for (const line of reportLines) {
    if (line.length === 0) continue;
    const w = measureLine(tmpCtx, line);
    if (w > maxWidth) maxWidth = w;
  }

  const reportWidth = Math.ceil(maxWidth + REPORT_PAD_X * 2);
  const canvasWidth = reportWidth + CALLOUT_MARGIN;
  const canvasHeight = Math.ceil(reportLines.length * LINE_HEIGHT + PAD_Y * 2);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Render report lines
  const lineYPositions = [];
  let y = PAD_Y + FONT_SIZE;
  for (const line of reportLines) {
    lineYPositions.push(y);
    let x = REPORT_PAD_X;
    for (const seg of line) {
      ctx.font = seg.bold ? `bold ${FONT_SIZE}px "JetBrains Mono"` : `${FONT_SIZE}px "JetBrains Mono"`;
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
    y += LINE_HEIGHT;
  }

  // Render callouts with leader lines
  const CALLOUT_FONT = 11;
  const calloutLabelX = reportWidth + 36;

  // Resolve Y positions and prevent vertical overlap (min 16px apart)
  const resolvedCallouts = CALLOUTS.map(c => ({
    ...c,
    rawY: lineYPositions[c.line] + (c.offsetY || 0),
  }));
  resolvedCallouts.sort((a, b) => a.rawY - b.rawY);

  const MIN_GAP = 16;
  const placedY = [];
  for (const c of resolvedCallouts) {
    let targetY = c.rawY;
    for (const prev of placedY) {
      if (targetY - prev < MIN_GAP) {
        targetY = prev + MIN_GAP;
      }
    }
    placedY.push(targetY);
    c.placedY = targetY;
  }

  for (const callout of resolvedCallouts) {
    const anchorY = callout.rawY - 4;
    const labelY = callout.placedY;
    const anchorX = reportWidth - 16;

    // Dot at anchor point
    ctx.beginPath();
    ctx.arc(anchorX, anchorY, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.calloutDot;
    ctx.fill();

    // Leader line: horizontal from dot, bend to label Y if needed
    const elbowX = reportWidth + 12;
    ctx.beginPath();
    ctx.moveTo(anchorX + 3, anchorY);
    ctx.lineTo(elbowX, anchorY);
    if (Math.abs(labelY - anchorY) > 2) {
      ctx.lineTo(elbowX, labelY - 4);
      ctx.lineTo(calloutLabelX - 6, labelY - 4);
    } else {
      ctx.lineTo(calloutLabelX - 6, anchorY);
    }
    ctx.strokeStyle = COLORS.calloutLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Label text
    ctx.fillStyle = COLORS.callout;
    ctx.font = `${CALLOUT_FONT}px "JetBrains Mono"`;
    ctx.fillText(callout.label, calloutLabelX, labelY);
  }

  const outPath = path.join(__dirname, 'report-preview.png');
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
  console.log(`Written: ${outPath} (${canvasWidth}x${canvasHeight})`);
}

render();
