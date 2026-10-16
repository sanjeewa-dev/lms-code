/**
 * Builds docs/ARCHITECT_TECHNICAL_BRIEF.pdf from docs/ARCHITECT_TECHNICAL_BRIEF.md
 * Usage: cd scripts/architect-brief && npm install && npm run build
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const MD = path.join(ROOT, 'docs', 'ARCHITECT_TECHNICAL_BRIEF.md');
const OUT = path.join(ROOT, 'docs', 'ARCHITECT_TECHNICAL_BRIEF.pdf');
const HTML_OUT = path.join(__dirname, 'ARCHITECT_TECHNICAL_BRIEF.print.html');

if (!fs.existsSync(MD)) {
  console.error(`Missing ${MD}`);
  process.exit(1);
}

const source = fs.readFileSync(MD, 'utf8');

const renderer = new marked.Renderer();
const defaultCode = renderer.code.bind(renderer);
renderer.code = function code(code, infostring, escaped) {
  const lang = (infostring || '').trim().split(/\s+/)[0];
  if (lang === 'mermaid') {
    const text = typeof code === 'object' && code !== null ? code.text : code;
    return `<pre class="mermaid">${escapeHtml(String(text ?? ''))}</pre>\n`;
  }
  // marked v15 may pass a token object
  if (typeof code === 'object' && code !== null && 'text' in code) {
    return defaultCode(code);
  }
  return defaultCode(code, infostring, escaped);
};

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

marked.setOptions({ gfm: true, breaks: false });
const bodyHtml = marked.parse(source, { renderer });

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Mindspark LMS — Architect Technical Brief</title>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'neutral',
      securityLevel: 'loose',
      flowchart: { htmlLabels: true, curve: 'basis' },
    });
    window.__mermaidReady = mermaid.run({ querySelector: '.mermaid' }).then(() => {
      document.documentElement.setAttribute('data-mermaid', 'ready');
    }).catch((err) => {
      console.error(err);
      document.documentElement.setAttribute('data-mermaid', 'error');
    });
  </script>
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Segoe UI", Calibri, Arial, sans-serif;
      font-size: 10.5pt;
      line-height: 1.45;
      color: #0f172a;
      max-width: 100%;
      margin: 0;
      padding: 0;
    }
    h1 {
      font-size: 20pt;
      line-height: 1.2;
      margin: 0 0 12pt;
      color: #0f172a;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 8pt;
    }
    h2 {
      font-size: 13.5pt;
      margin: 22pt 0 8pt;
      color: #1e293b;
      page-break-after: avoid;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 4pt;
    }
    h3 {
      font-size: 11.5pt;
      margin: 14pt 0 6pt;
      color: #1e40af;
      page-break-after: avoid;
    }
    p, li { orphans: 3; widows: 3; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8pt 0 12pt;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 5pt 7pt;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f1f5f9; font-weight: 600; }
    code {
      font-family: Consolas, "Courier New", monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      padding: 1pt 3pt;
      border-radius: 2pt;
    }
    pre:not(.mermaid) {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 8pt;
      overflow-x: auto;
      font-size: 8pt;
      page-break-inside: avoid;
    }
    pre.mermaid {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      padding: 10pt;
      text-align: center;
      page-break-inside: avoid;
      overflow: hidden;
    }
    pre.mermaid svg { max-width: 100%; height: auto; }
    hr { border: none; border-top: 1px solid #cbd5e1; margin: 16pt 0; }
    a { color: #1d4ed8; text-decoration: none; }
    strong { font-weight: 600; }
    blockquote {
      margin: 8pt 0;
      padding: 6pt 10pt;
      border-left: 3px solid #2563eb;
      background: #eff6ff;
      color: #1e293b;
    }
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

fs.writeFileSync(HTML_OUT, html, 'utf8');
console.log(`Wrote ${HTML_OUT}`);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });
  await page.goto(`file://${HTML_OUT.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle0',
    timeout: 120_000,
  });
  await page.waitForFunction(
    () => document.documentElement.getAttribute('data-mermaid') === 'ready'
      || document.documentElement.getAttribute('data-mermaid') === 'error'
      || document.querySelectorAll('pre.mermaid').length === 0,
    { timeout: 90_000 }
  );
  // Allow SVG layout to settle
  await new Promise((r) => setTimeout(r, 1500));

  await page.pdf({
    path: OUT,
    format: 'A4',
    printBackground: true,
    margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size:8px;width:100%;padding:0 12mm;color:#64748b;display:flex;justify-content:space-between;">
        <span>Mindspark LMS — Architect Technical Brief (as-built)</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
  });
  console.log(`Wrote ${OUT}`);
} finally {
  await browser.close();
}
