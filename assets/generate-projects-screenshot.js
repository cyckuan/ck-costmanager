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
const PAD_X = 40;
const PAD_Y = 28;

const COLORS = {
  bg: '#FFFFFF',
  text: '#1e1e1e',
  dim: '#6e7681',
  border: '#8b949e',
  header: '#1e1e1e',
  opus: '#8b5cf6',
  gradLow: '#10b981',
  gradHigh: '#ea580c',
  overBudget: '#dc2626',
  budget: '#ea580c',
  marker: '#1e1e1e',
  callout: '#475569',
  calloutLine: '#94a3b8',
  calloutDot: '#64748b',
};

function buildLines() {
  const lines = [];
  const h = (t) => ({ text: t, color: COLORS.header, bold: true });
  const d = (t) => ({ text: t, color: COLORS.dim });
  const b = (t) => ({ text: t, color: COLORS.border });
  const n = (t) => ({ text: t, color: COLORS.text });
  const green = (t) => ({ text: t, color: COLORS.gradLow });
  const orange = (t) => ({ text: t, color: COLORS.gradHigh });
  const red = (t) => ({ text: t, color: COLORS.overBudget, bold: true });
  const mk = (t) => ({ text: t, color: COLORS.marker, bold: true });

  lines.push([]);
  lines.push([h('  All Projects'), d('  (4 tracked)')]);
  lines.push([b('  ───────────────────────────────────────────────────────────────────')]);
  lines.push([b('    Project                         │ Cost     │ Budget   │ Status     ')]);
  lines.push([b('  ──────────────────────────────────┼──────────┼──────────┼────────────')]);
  lines.push([n('  '), mk('▸'), n(' '), h('cyckuan/ck-costmanager         '), b('│'), n(' $4.72    '), b('│'), n(' $10.00   '), b('│'), green(' 47%')]);
  lines.push([n('    '), d('cyckuan/ck-statusline          '), b('│'), n(' $18.30   '), b('│'), n(' $25.00   '), b('│'), green(' 73%')]);
  lines.push([n('    '), d('acme-corp/billing-api          '), b('│'), n(' $42.15   '), b('│'), n(' $50.00   '), b('│'), orange(' 84%')]);
  lines.push([n('    '), d('/home/user/scratch/prototype   '), b('│'), n(' $7.80    '), b('│'), n(' $5.00    '), b('│'), red(' 156% OVER')]);
  lines.push([b('  ──────────────────────────────────┼──────────┼──────────┼────────────')]);
  lines.push([h('    Grand total                     '), b('│'), h(' $72.97   '), b('│')]);
  lines.push([]);
  lines.push([d('    Last activity: 2m ago (cyckuan/ck-costmanager)')]);
  lines.push([]);

  return lines;
}

const CALLOUTS = [
  { line: 1, label: 'Project count', side: 'right' },
  { line: 5, label: '▸ marks current project', side: 'right' },
  { line: 8, label: 'Orange at >80% budget', side: 'right' },
  { line: 9, label: 'Red when over budget', side: 'right' },
  { line: 10, label: 'Grand total across all', side: 'right' },
  { line: 12, label: 'Most recent activity', side: 'right' },
];

function padRight(str, len) {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function measureLine(ctx, segments) {
  let width = 0;
  for (const seg of segments) {
    ctx.font = seg.bold ? `bold ${FONT_SIZE}px "JetBrains Mono"` : `${FONT_SIZE}px "JetBrains Mono"`;
    width += ctx.measureText(seg.text).width;
  }
  return width;
}

function render() {
  const reportLines = buildLines();

  const tmpCanvas = createCanvas(1, 1);
  const tmpCtx = tmpCanvas.getContext('2d');
  tmpCtx.font = `${FONT_SIZE}px "JetBrains Mono"`;

  let maxWidth = 0;
  for (const line of reportLines) {
    if (line.length === 0) continue;
    const w = measureLine(tmpCtx, line);
    if (w > maxWidth) maxWidth = w;
  }

  const CALLOUT_MARGIN = 220;
  const reportWidth = Math.ceil(maxWidth + PAD_X * 2);
  const canvasWidth = reportWidth + CALLOUT_MARGIN;
  const canvasHeight = Math.ceil(reportLines.length * LINE_HEIGHT + PAD_Y * 2);

  const canvas = createCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const lineYPositions = [];
  let y = PAD_Y + FONT_SIZE;
  for (const line of reportLines) {
    lineYPositions.push(y);
    let x = PAD_X;
    for (const seg of line) {
      ctx.font = seg.bold ? `bold ${FONT_SIZE}px "JetBrains Mono"` : `${FONT_SIZE}px "JetBrains Mono"`;
      ctx.fillStyle = seg.color;
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
    y += LINE_HEIGHT;
  }

  // Callouts
  const CALLOUT_FONT = 11;
  const calloutLabelX = reportWidth + 36;

  const resolved = CALLOUTS.map(c => ({ ...c, rawY: lineYPositions[c.line] }));
  resolved.sort((a, b) => a.rawY - b.rawY);

  const MIN_GAP = 16;
  const placedY = [];
  for (const c of resolved) {
    let targetY = c.rawY;
    for (const prev of placedY) {
      if (targetY - prev < MIN_GAP) targetY = prev + MIN_GAP;
    }
    placedY.push(targetY);
    c.placedY = targetY;
  }

  for (const callout of resolved) {
    const anchorY = callout.rawY - 4;
    const labelY = callout.placedY;
    const anchorX = reportWidth - 16;

    ctx.beginPath();
    ctx.arc(anchorX, anchorY, 3, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.calloutDot;
    ctx.fill();

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

    ctx.fillStyle = COLORS.callout;
    ctx.font = `${CALLOUT_FONT}px "JetBrains Mono"`;
    ctx.fillText(callout.label, calloutLabelX, labelY);
  }

  const outPath = path.join(__dirname, 'projects-preview.png');
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outPath, buffer);
  console.log(`Written: ${outPath} (${canvasWidth}x${canvasHeight})`);
}

render();
