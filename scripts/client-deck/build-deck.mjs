// Generates docs/Mindspark-LMS-Client-Presentation.pptx
// Usage: cd scripts/client-deck && npm install && npm run build
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import PptxGenJS from 'pptxgenjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOGO = path.join(ROOT, 'docs', 'mindspark-logo.png');
const OUT = path.join(ROOT, 'docs', 'Mindspark-LMS-Client-Presentation.pptx');

if (!fs.existsSync(LOGO)) {
  console.error(`Logo not found at ${LOGO}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Brand
// ---------------------------------------------------------------------------
const C = {
  brand: '2563EB',
  brandDark: '1D4ED8',
  brandLight: '93C5FD',
  brandPale: 'DBEAFE',
  ink: '0F172A',
  inkSoft: '1E293B',
  slate: '64748B',
  slateLight: '94A3B8',
  line: 'CBD5E1',
  surface: 'FFFFFF',
  muted: 'F1F5F9',
  darkBg: '0B1120',
  darkCard: '172033',
  darkLine: '2A3650',
  danger: 'F87171',
  success: '34D399',
  amber: 'FBBF24',
};
const FONT = 'Calibri';

// Slide geometry (LAYOUT_16x9 = 10in x 5.625in)
const W = 10;
const H = 5.625;
const MX = 0.6; // horizontal margin
const CW = W - MX * 2; // content width

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';
pptx.author = 'Mindspark';
pptx.company = 'Mindspark';
pptx.title = 'Mindspark LMS - Client Presentation';
pptx.subject = 'Product introduction for institutes and tutors';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const slideBuilders = [];
function defineSlide(fn) {
  slideBuilders.push(fn);
}

function textColor(dark, light = C.ink, darkC = 'F8FAFC') {
  return dark ? darkC : light;
}

function baseSlide({ dark = false, footer = true, index, total }) {
  const slide = pptx.addSlide();
  slide.background = { color: dark ? C.darkBg : C.surface };

  if (dark) {
    // Soft decorative glow in the corner.
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 7.2,
      y: -1.6,
      w: 4.6,
      h: 4.6,
      fill: { color: C.brand, transparency: 86 },
      line: { color: C.brand, transparency: 100 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: -1.4,
      y: 3.9,
      w: 3.4,
      h: 3.4,
      fill: { color: C.brandDark, transparency: 90 },
      line: { color: C.brandDark, transparency: 100 },
    });
  }

  if (footer) {
    slide.addShape(pptx.ShapeType.line, {
      x: MX,
      y: H - 0.42,
      w: CW,
      h: 0,
      line: { color: dark ? C.darkLine : C.line, width: 0.75 },
    });
    slide.addImage({ path: LOGO, x: MX, y: H - 0.34, w: 0.24, h: 0.24 });
    slide.addText('Mindspark LMS', {
      x: MX + 0.3,
      y: H - 0.36,
      w: 2.5,
      h: 0.28,
      fontFace: FONT,
      fontSize: 9,
      color: dark ? C.slateLight : C.slate,
      bold: true,
      valign: 'middle',
    });
    slide.addText(`${index} / ${total}`, {
      x: W - MX - 1.2,
      y: H - 0.36,
      w: 1.2,
      h: 0.28,
      fontFace: FONT,
      fontSize: 9,
      color: dark ? C.slateLight : C.slate,
      align: 'right',
      valign: 'middle',
    });
  }
  return slide;
}

function eyebrow(slide, text, { dark = false, y = 0.55 } = {}) {
  slide.addText(text.toUpperCase(), {
    x: MX,
    y,
    w: CW,
    h: 0.28,
    fontFace: FONT,
    fontSize: 10,
    bold: true,
    charSpacing: 3,
    color: dark ? C.brandLight : C.brand,
    valign: 'middle',
  });
}

function heading(slide, text, { dark = false, y = 0.85, h = 0.7, size = 26, w = CW } = {}) {
  slide.addText(text, {
    x: MX,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: size,
    bold: true,
    color: textColor(dark),
    valign: 'top',
    lineSpacingMultiple: 0.95,
  });
}

function lede(slide, text, { dark = false, y = 1.55, h = 0.6, w = CW, size = 13 } = {}) {
  slide.addText(text, {
    x: MX,
    y,
    w,
    h,
    fontFace: FONT,
    fontSize: size,
    color: dark ? C.slateLight : C.slate,
    valign: 'top',
    lineSpacingMultiple: 1.1,
  });
}

/**
 * Cards grid. items: { title, body?: string, bullets?: string[], badge?: string }
 */
function cards(slide, items, { cols, x = MX, y, w = CW, h, gap = 0.18, dark = false, titleSize = 13, bodySize = 10.5 }) {
  const rows = Math.ceil(items.length / cols);
  const cardW = (w - gap * (cols - 1)) / cols;
  const cardH = (h - gap * (rows - 1)) / rows;

  items.forEach((item, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const cx = x + c * (cardW + gap);
    const cy = y + r * (cardH + gap);

    slide.addShape(pptx.ShapeType.roundRect, {
      x: cx,
      y: cy,
      w: cardW,
      h: cardH,
      rectRadius: 0.08,
      fill: { color: dark ? C.darkCard : C.muted },
      line: { color: dark ? C.darkLine : C.line, width: 0.75 },
    });
    // accent bar
    slide.addShape(pptx.ShapeType.rect, {
      x: cx,
      y: cy + 0.18,
      w: 0.05,
      h: 0.34,
      fill: { color: C.brand },
      line: { color: C.brand, width: 0 },
    });

    let textY = cy + 0.12;
    if (item.badge) {
      slide.addText(item.badge.toUpperCase(), {
        x: cx + 0.2,
        y: textY,
        w: cardW - 0.35,
        h: 0.22,
        fontFace: FONT,
        fontSize: 8,
        bold: true,
        charSpacing: 2,
        color: dark ? C.brandLight : C.brand,
        valign: 'middle',
      });
      textY += 0.22;
    }

    slide.addText(item.title, {
      x: cx + 0.2,
      y: textY,
      w: cardW - 0.35,
      h: 0.4,
      fontFace: FONT,
      fontSize: titleSize,
      bold: true,
      color: textColor(dark),
      valign: 'middle',
    });
    textY += 0.42;

    const bodyH = cy + cardH - textY - 0.12;
    if (item.bullets) {
      const runs = item.bullets.map((b, bi) => ({
        text: b,
        options: {
          bullet: { indent: 12 },
          breakLine: bi < item.bullets.length - 1,
        },
      }));
      slide.addText(runs, {
        x: cx + 0.2,
        y: textY,
        w: cardW - 0.35,
        h: bodyH,
        fontFace: FONT,
        fontSize: bodySize,
        color: dark ? C.slateLight : C.inkSoft,
        valign: 'top',
        paraSpaceAfter: 3,
        lineSpacingMultiple: 1.05,
      });
    } else if (item.body) {
      slide.addText(item.body, {
        x: cx + 0.2,
        y: textY,
        w: cardW - 0.35,
        h: bodyH,
        fontFace: FONT,
        fontSize: bodySize,
        color: dark ? C.slateLight : C.inkSoft,
        valign: 'top',
        lineSpacingMultiple: 1.1,
      });
    }
  });
}

function numberedList(slide, items, { x = MX, y, w = CW, rowH = 0.55, dark = false, size = 14 }) {
  items.forEach((item, i) => {
    const cy = y + i * rowH;
    slide.addShape(pptx.ShapeType.ellipse, {
      x,
      y: cy + 0.06,
      w: 0.4,
      h: 0.4,
      fill: { color: dark ? C.brand : C.brandPale },
      line: { color: C.brand, width: 0.75 },
    });
    slide.addText(String(i + 1).padStart(2, '0'), {
      x,
      y: cy + 0.06,
      w: 0.4,
      h: 0.4,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color: dark ? 'FFFFFF' : C.brandDark,
      align: 'center',
      valign: 'middle',
    });
    const runs = [{ text: item.title, options: { bold: true, color: textColor(dark) } }];
    if (item.sub) {
      runs.push({ text: '  ' + item.sub, options: { color: dark ? C.slateLight : C.slate, fontSize: size - 2 } });
    }
    slide.addText(runs, {
      x: x + 0.55,
      y: cy,
      w: w - 0.55,
      h: 0.52,
      fontFace: FONT,
      fontSize: size,
      valign: 'middle',
    });
  });
}

function notes(slide, lines) {
  slide.addNotes(Array.isArray(lines) ? lines.join('\n') : lines);
}

function processFlow(slide, steps, { x = MX, y, w = CW, h = 1.15, dark = true }) {
  const gap = 0.22;
  const stepW = (w - gap * (steps.length - 1)) / steps.length;
  steps.forEach((s, i) => {
    const sx = x + i * (stepW + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: sx,
      y,
      w: stepW,
      h,
      rectRadius: 0.08,
      fill: { color: dark ? C.darkCard : C.muted },
      line: { color: dark ? C.darkLine : C.line, width: 0.75 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: sx + 0.15,
      y: y + 0.14,
      w: 0.34,
      h: 0.34,
      fill: { color: C.brand },
      line: { color: C.brand, width: 0 },
    });
    slide.addText(String(i + 1), {
      x: sx + 0.15,
      y: y + 0.14,
      w: 0.34,
      h: 0.34,
      fontFace: FONT,
      fontSize: 10,
      bold: true,
      color: 'FFFFFF',
      align: 'center',
      valign: 'middle',
    });
    slide.addText(s.title, {
      x: sx + 0.12,
      y: y + 0.52,
      w: stepW - 0.24,
      h: 0.3,
      fontFace: FONT,
      fontSize: 11.5,
      bold: true,
      color: textColor(dark),
      valign: 'top',
    });
    slide.addText(s.body, {
      x: sx + 0.12,
      y: y + 0.8,
      w: stepW - 0.24,
      h: h - 0.88,
      fontFace: FONT,
      fontSize: 9.5,
      color: dark ? C.slateLight : C.slate,
      valign: 'top',
      lineSpacingMultiple: 1.05,
    });
    if (i < steps.length - 1) {
      slide.addShape(pptx.ShapeType.chevron, {
        x: sx + stepW + 0.04,
        y: y + h / 2 - 0.1,
        w: 0.14,
        h: 0.2,
        fill: { color: C.brand },
        line: { color: C.brand, width: 0 },
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Slides
// ---------------------------------------------------------------------------

// 1. Title
defineSlide((ctx) => {
  const s = baseSlide({ ...ctx, dark: true, footer: false });
  slide_logoRow(s, { dark: true, x: MX, y: 0.65 });

  eyebrow(s, 'Client presentation', { dark: true, y: 1.75 });
  s.addText('One platform.\nEvery institute.\nSmarter learning.', {
    x: MX,
    y: 2.0,
    w: 6.2,
    h: 1.95,
    fontFace: FONT,
    fontSize: 38,
    bold: true,
    color: 'F8FAFC',
    valign: 'top',
    lineSpacingMultiple: 0.92,
  });
  s.addText('Learn smarter. Teach clearer.', {
    x: MX,
    y: 4.05,
    w: 6,
    h: 0.35,
    fontFace: FONT,
    fontSize: 15,
    bold: true,
    color: C.brandLight,
    valign: 'middle',
  });
  s.addText(
    'The AI-first learning platform for institutes and tutors: classes, live teaching, assessments, fees, and AI tools in one branded space.',
    {
      x: MX,
      y: 4.42,
      w: 6.4,
      h: 0.7,
      fontFace: FONT,
      fontSize: 12,
      color: C.slateLight,
      valign: 'top',
      lineSpacingMultiple: 1.1,
    }
  );

  // Right side: pillar chips
  const chips = ['Teach', 'Operate', 'Improve'];
  chips.forEach((c, i) => {
    const cy = 2.2 + i * 0.62;
    s.addShape(pptx.ShapeType.roundRect, {
      x: 7.3,
      y: cy,
      w: 2.1,
      h: 0.48,
      rectRadius: 0.24,
      fill: { color: C.darkCard },
      line: { color: C.darkLine, width: 0.75 },
    });
    s.addShape(pptx.ShapeType.ellipse, {
      x: 7.45,
      y: cy + 0.14,
      w: 0.2,
      h: 0.2,
      fill: { color: C.brand },
      line: { color: C.brand, width: 0 },
    });
    s.addText(c, {
      x: 7.75,
      y: cy,
      w: 1.5,
      h: 0.48,
      fontFace: FONT,
      fontSize: 13,
      bold: true,
      color: 'F8FAFC',
      valign: 'middle',
    });
  });

  s.addText('Confidential - prepared for prospective partner institutes', {
    x: MX,
    y: H - 0.5,
    w: CW,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: C.slate,
    valign: 'middle',
  });

  notes(s, [
    'Open with the one-liner: Mindspark is the AI-first LMS for institutes and tutors - teach, collect fees, and catch at-risk students before they drop, under your own brand.',
    'Set expectations: 15-20 minutes, then a live walkthrough of their institute flow.',
    'Ask up front: how many students / batches, how are fees collected today, where do materials live now (WhatsApp, Drive, Zoom)?',
  ]);
});

function slide_logoRow(s, { dark, x, y }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 0.7,
    h: 0.7,
    rectRadius: 0.14,
    fill: { color: 'FFFFFF' },
    line: { color: 'FFFFFF', width: 0 },
  });
  s.addImage({ path: LOGO, x: x + 0.06, y: y + 0.06, w: 0.58, h: 0.58 });
  s.addText('Mindspark LMS', {
    x: x + 0.85,
    y,
    w: 4,
    h: 0.7,
    fontFace: FONT,
    fontSize: 20,
    bold: true,
    color: textColor(dark),
    valign: 'middle',
  });
}

// 2. Agenda
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Agenda');
  heading(s, 'What we will cover today');
  lede(s, 'A short tour of the product from the institute owner\'s point of view, then a live demo.', { h: 0.45 });

  const left = [
    { title: 'The challenge', sub: 'Why institutes outgrow WhatsApp, Drive and spreadsheets' },
    { title: 'Mindspark at a glance', sub: 'One branded platform: Teach, Operate, Improve' },
    { title: 'Teach', sub: 'Class hub, protected materials, live class, quizzes' },
  ];
  const right = [
    { title: 'Operate and fees', sub: 'Enrollment, attendance, bank slips and PayHere' },
    { title: 'AI and early intervention', sub: 'AI Study, AI Copilot, at-risk, parent trust' },
    { title: 'Security and next steps', sub: 'Data isolation, content protection, pilot plan' },
  ];
  const colW = (CW - 0.4) / 2;
  const listY = 2.25;
  left.forEach((it, i) => {
    numberedRow(s, i + 1, it, { x: MX, y: listY + i * 0.9, w: colW });
  });
  right.forEach((it, i) => {
    numberedRow(s, i + 4, it, { x: MX + colW + 0.4, y: listY + i * 0.9, w: colW });
  });

  notes(s, [
    'Keep this quick. The goal is to let the owner know where their key questions (fees, branding, parents) will be answered.',
  ]);
});

function numberedRow(s, n, item, { x, y, w, dark = false }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x,
    y,
    w: 0.5,
    h: 0.5,
    rectRadius: 0.1,
    fill: { color: dark ? C.brand : C.brandPale },
    line: { color: dark ? C.brand : C.brandPale, width: 0 },
  });
  s.addText(String(n).padStart(2, '0'), {
    x,
    y,
    w: 0.5,
    h: 0.5,
    fontFace: FONT,
    fontSize: 12,
    bold: true,
    color: dark ? 'FFFFFF' : C.brandDark,
    align: 'center',
    valign: 'middle',
  });
  s.addText(item.title, {
    x: x + 0.65,
    y: y - 0.02,
    w: w - 0.65,
    h: 0.3,
    fontFace: FONT,
    fontSize: 14,
    bold: true,
    color: textColor(dark),
    valign: 'middle',
  });
  s.addText(item.sub, {
    x: x + 0.65,
    y: y + 0.27,
    w: w - 0.65,
    h: 0.3,
    fontFace: FONT,
    fontSize: 10.5,
    color: dark ? C.slateLight : C.slate,
    valign: 'top',
  });
}

// 3. The challenge
defineSlide((ctx) => {
  const s = baseSlide({ ...ctx, dark: true });
  eyebrow(s, 'The challenge', { dark: true });
  heading(s, 'Institutes juggle too many tools', { dark: true });
  lede(
    s,
    'Teaching, content, live classes, fee collection and parent updates usually live in five different apps - with no single view of who is falling behind.',
    { dark: true, h: 0.65, w: 8.2 }
  );

  const problems = [
    ['Materials leak', 'Notes shared as files on WhatsApp or Drive get forwarded freely - your content walks out the door.'],
    ['Fees are a chase', 'Bank transfers tracked by hand; slips arrive on chat, approvals get missed, revenue is unclear.'],
    ['No early warning', 'Low attendance, missing work and weak quiz scores are only noticed at exam time.'],
    ['Parents are in the dark', 'Guardians ask for updates by phone; there is no trusted, up-to-date view of progress.'],
  ];
  const y0 = 2.4;
  const rowH = 0.62;
  problems.forEach(([t, b], i) => {
    const cy = y0 + i * rowH;
    s.addShape(pptx.ShapeType.rect, {
      x: MX,
      y: cy + 0.06,
      w: 0.06,
      h: rowH - 0.18,
      fill: { color: C.danger },
      line: { color: C.danger, width: 0 },
    });
    s.addText(
      [
        { text: t, options: { bold: true, color: 'F8FAFC', fontSize: 13.5 } },
        { text: '  ' + b, options: { color: C.slateLight, fontSize: 11.5 } },
      ],
      {
        x: MX + 0.2,
        y: cy,
        w: CW - 0.2,
        h: rowH - 0.06,
        fontFace: FONT,
        valign: 'middle',
      }
    );
  });

  notes(s, [
    'Mirror back what they told you on slide 1. Most institutes recognise at least three of these four.',
    'Do not bash their current tools - the point is fragmentation, not that WhatsApp or Zoom are bad.',
  ]);
});

// 4. Solution
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Mindspark in one sentence');
  heading(s, 'The AI-first LMS for institutes and tutors - under your own brand', { h: 0.95, w: 8.6 });
  lede(
    s,
    'Teach, collect fees, and catch at-risk students before they drop. Each institute gets its own fully isolated branded space on one scalable platform.',
    { y: 1.8, h: 0.6, w: 8.6 }
  );
  cards(
    s,
    [
      {
        badge: 'Pillar 1',
        title: 'Teach',
        body: 'Classes and batches, protected materials, live rooms, quizzes, assignments, gradebook and recorded lessons in one class hub.',
      },
      {
        badge: 'Pillar 2',
        title: 'Operate',
        body: 'Enrollment approvals, attendance, monthly fees via bank slip or PayHere, student ID cards, notices and institute branding.',
      },
      {
        badge: 'Pillar 3',
        title: 'Improve',
        body: 'AI Study for students, AI Copilot for teachers, at-risk detection with an intervention timeline, and a Parent Trust Center.',
      },
    ],
    { cols: 3, y: 2.55, h: 2.35 }
  );
  notes(s, [
    'The three pillars are the backbone of the deck: Teach, Operate, Improve.',
    'Emphasise "your own brand": students and parents see the institute, not Mindspark.',
  ]);
});

// 5. Your branded institute
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'White-label');
  heading(s, 'Your institute, your brand');
  lede(s, 'A public landing page at your own address, with your logo, notices, events and open lessons - plus one-click student registration.', { h: 0.65, w: 5.0 });

  const bullets = [
    'Own URL for the institute (for example yourdomain.com/your-institute)',
    'Logo and institute name across every screen and email',
    'Public landing page: notices, events, public video lessons, Register and Sign in',
    'Student self-registration, invite links and class join tokens',
    'Institute settings: bank details, monthly fee rules, self-enrollment on or off, PayHere',
  ];
  s.addText(
    bullets.map((b, i) => ({ text: b, options: { bullet: { indent: 14 }, breakLine: i < bullets.length - 1 } })),
    {
      x: MX,
      y: 2.4,
      w: 4.9,
      h: 2.5,
      fontFace: FONT,
      fontSize: 12,
      color: C.inkSoft,
      valign: 'top',
      paraSpaceAfter: 6,
      lineSpacingMultiple: 1.08,
    }
  );

  // Browser mock
  const bx = 5.85;
  const by = 1.25;
  const bw = 3.55;
  const bh = 3.65;
  s.addShape(pptx.ShapeType.roundRect, {
    x: bx,
    y: by,
    w: bw,
    h: bh,
    rectRadius: 0.08,
    fill: { color: 'FFFFFF' },
    line: { color: C.line, width: 1 },
    shadow: { type: 'outer', blur: 6, offset: 2, angle: 90, color: '000000', opacity: 0.12 },
  });
  // Browser top bar
  s.addShape(pptx.ShapeType.rect, {
    x: bx,
    y: by,
    w: bw,
    h: 0.36,
    fill: { color: C.muted },
    line: { color: C.line, width: 0.75 },
  });
  ['F87171', 'FBBF24', '34D399'].forEach((col, i) => {
    s.addShape(pptx.ShapeType.ellipse, {
      x: bx + 0.12 + i * 0.17,
      y: by + 0.12,
      w: 0.12,
      h: 0.12,
      fill: { color: col },
      line: { color: col, width: 0 },
    });
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: bx + 0.75,
    y: by + 0.08,
    w: bw - 0.9,
    h: 0.2,
    rectRadius: 0.1,
    fill: { color: 'FFFFFF' },
    line: { color: C.line, width: 0.5 },
  });
  s.addText('yourdomain.com/your-institute', {
    x: bx + 0.75,
    y: by + 0.08,
    w: bw - 0.9,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.5,
    color: C.slate,
    align: 'center',
    valign: 'middle',
  });
  // Hero band
  s.addShape(pptx.ShapeType.rect, {
    x: bx + 0.01,
    y: by + 0.36,
    w: bw - 0.02,
    h: 1.05,
    fill: { color: C.ink },
    line: { color: C.ink, width: 0 },
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: bx + 0.2,
    y: by + 0.52,
    w: 0.42,
    h: 0.42,
    rectRadius: 0.08,
    fill: { color: 'FFFFFF' },
    line: { color: 'FFFFFF', width: 0 },
  });
  s.addText('LOGO', {
    x: bx + 0.2,
    y: by + 0.52,
    w: 0.42,
    h: 0.42,
    fontFace: FONT,
    fontSize: 6.5,
    bold: true,
    color: C.brandDark,
    align: 'center',
    valign: 'middle',
  });
  s.addText('Your Institute Name', {
    x: bx + 0.72,
    y: by + 0.5,
    w: 2.6,
    h: 0.26,
    fontFace: FONT,
    fontSize: 11,
    bold: true,
    color: 'FFFFFF',
    valign: 'middle',
  });
  s.addText('Classes - Live sessions - Notices - Events', {
    x: bx + 0.72,
    y: by + 0.74,
    w: 2.6,
    h: 0.2,
    fontFace: FONT,
    fontSize: 7.5,
    color: C.slateLight,
    valign: 'middle',
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: bx + 0.72,
    y: by + 1.02,
    w: 0.78,
    h: 0.24,
    rectRadius: 0.05,
    fill: { color: C.brand },
    line: { color: C.brand, width: 0 },
  });
  s.addText('Register', {
    x: bx + 0.72,
    y: by + 1.02,
    w: 0.78,
    h: 0.24,
    fontFace: FONT,
    fontSize: 7.5,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
    valign: 'middle',
  });
  s.addShape(pptx.ShapeType.roundRect, {
    x: bx + 1.58,
    y: by + 1.02,
    w: 0.78,
    h: 0.24,
    rectRadius: 0.05,
    fill: { color: C.ink },
    line: { color: C.slateLight, width: 0.5 },
  });
  s.addText('Sign in', {
    x: bx + 1.58,
    y: by + 1.02,
    w: 0.78,
    h: 0.24,
    fontFace: FONT,
    fontSize: 7.5,
    bold: true,
    color: 'FFFFFF',
    align: 'center',
    valign: 'middle',
  });
  // Content cards inside mock
  const mockCards = [
    ['Notices', 'Term 2 timetable published'],
    ['Upcoming events', 'Parent meeting - Sat 10:00'],
    ['Open lessons', 'Intro to Algebra - watch free'],
  ];
  mockCards.forEach(([t, b], i) => {
    const cy = by + 1.58 + i * 0.64;
    s.addShape(pptx.ShapeType.roundRect, {
      x: bx + 0.2,
      y: cy,
      w: bw - 0.4,
      h: 0.52,
      rectRadius: 0.05,
      fill: { color: C.muted },
      line: { color: C.line, width: 0.5 },
    });
    s.addText(
      [
        { text: t, options: { bold: true, color: C.ink, fontSize: 8, breakLine: true } },
        { text: b, options: { color: C.slate, fontSize: 7.5 } },
      ],
      { x: bx + 0.32, y: cy + 0.02, w: bw - 0.6, h: 0.48, fontFace: FONT, valign: 'middle' }
    );
  });

  notes(s, [
    'Illustrative mock-up on the right - in the live demo show the real landing page of the demo institute.',
    'Branding is included for every institute; no separate white-label fee for logo and landing page.',
  ]);
});

// 6. Teach
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Pillar 1 - Teach');
  heading(s, 'Everything a class needs in one hub');
  lede(s, 'Teachers run the whole class from one place; students see only what they are enrolled in.', { h: 0.4 });
  cards(
    s,
    [
      {
        title: 'Protected materials',
        bullets: ['PDFs and notes rendered page by page', 'Watermarked, view-only in the browser', 'Original files are never downloadable'],
      },
      {
        title: 'Schedule and live class',
        bullets: ['Built-in live room (Jitsi) - no extra account', 'Zoom, Google Meet, Teams links supported', 'Email alerts when a session goes live'],
      },
      {
        title: 'Quizzes',
        bullets: ['MCQ builder with AI-assisted generation', 'Timed, single attempt, auto-graded', 'Leaderboard and per-question review'],
      },
      {
        title: 'Assignments',
        bullets: ['Students upload submissions', 'Teachers download, grade and give feedback'],
      },
      {
        title: 'Gradebook',
        bullets: ['Performance views per class', 'Filter weak performers in one click', 'Export for reports'],
      },
      {
        title: 'Videos and announcements',
        bullets: ['Recorded lessons (YouTube, Vimeo, URL)', 'Visibility: everyone, class or batch', 'Notices and events, pinned on landing'],
      },
    ],
    { cols: 3, y: 2.05, h: 2.95, titleSize: 12.5, bodySize: 9.5 }
  );
  notes(s, [
    'Content protection is the usual "wow" for owners who have had notes leak. Mention it is server-side rendering with watermark, not just a disabled right-click.',
    'Live class: Jitsi works in-browser with no licence; institutes that already pay for Zoom can keep using it.',
  ]);
});

// 7. Operate
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Pillar 2 - Operate');
  heading(s, 'Run the institute without spreadsheets');
  lede(s, 'Day-to-day admin lives in the same system as teaching, so nothing has to be re-typed or chased.', { h: 0.4 });
  cards(
    s,
    [
      {
        title: 'Enrollment and roster',
        bullets: ['Students self-register or join via invite / class link', 'Approve or reject enrollments', 'Student ID cards with QR code', 'Guardian contact details on file'],
      },
      {
        title: 'Attendance',
        bullets: ['Mark presence per session in seconds', 'History per student and per class', 'Feeds the at-risk signal automatically'],
      },
      {
        title: 'Fees and payments',
        bullets: ['Enrollment fee and monthly fees per class', 'Bank slip upload with staff approval', 'Optional PayHere online checkout', 'Grace days and reminders configurable'],
      },
      {
        title: 'Communication',
        bullets: ['In-app chat between staff and students', 'Notices and events with audience targeting', 'Email notifications for key moments'],
      },
    ],
    { cols: 2, y: 2.05, h: 2.95, titleSize: 13, bodySize: 10.5 }
  );
  notes(s, [
    'Ask how they handle monthly fees today. Most owners immediately see the value of slip upload plus approval.',
    'ID cards with QR are popular with multi-branch institutes.',
  ]);
});

// 8. Fees flow
defineSlide((ctx) => {
  const s = baseSlide({ ...ctx, dark: true });
  eyebrow(s, 'Fees and revenue visibility', { dark: true });
  heading(s, 'From "fee due" to "approved" in one tracked flow', { dark: true });
  lede(s, 'Every payment is tied to a student, a class and a month - so you always know who has paid, who is pending and who is overdue.', {
    dark: true,
    h: 0.6,
    w: 8.4,
  });
  processFlow(
    s,
    [
      { title: 'Price the class', body: 'Set an enrollment fee and/or monthly fee. Free classes activate instantly.' },
      { title: 'Student enrolls', body: 'Paid classes stay pending until payment is confirmed.' },
      { title: 'Pay', body: 'Upload a bank transfer slip, or pay online via PayHere.' },
      { title: 'Staff approve', body: 'Admin or teacher approves or rejects with one click; student is notified.' },
      { title: 'Access unlocks', body: 'Materials, live class and quizzes open; monthly rules keep access current.' },
    ],
    { y: 2.3, h: 1.6, dark: true }
  );

  const facts = [
    ['Monthly rules', 'Access requires the current month approved, or within configurable grace days.'],
    ['Reminders', 'Fee reminders and parent digests go out automatically from Smart Ops.'],
    ['Dashboard', 'Pending payments and revenue items appear on the admin home every day.'],
  ];
  const fw = (CW - 0.4) / 3;
  facts.forEach(([t, b], i) => {
    const fx = MX + i * (fw + 0.2);
    s.addText(
      [
        { text: t, options: { bold: true, color: C.brandLight, fontSize: 11, breakLine: true } },
        { text: b, options: { color: C.slateLight, fontSize: 10 } },
      ],
      { x: fx, y: 4.1, w: fw, h: 0.85, fontFace: FONT, valign: 'top', lineSpacingMultiple: 1.05 }
    );
  });

  notes(s, [
    'This is the owner slide. Walk the five steps slowly.',
    'Grace days: for example access continues until the 7th of the month, then locks until the slip is approved.',
    'PayHere is optional - institutes can start with bank slips only.',
  ]);
});

// 9. AI Study
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Pillar 3 - Improve (students)');
  heading(s, 'AI Study: on-demand help for every student');
  lede(s, 'A class-scoped Smart Learning Workspace. Students get help the moment they are stuck, not at the next live session.', { h: 0.6, w: 8.4 });
  cards(
    s,
    [
      { title: 'AI Tutor chat', body: 'Real-time Q&A on concepts from the selected class, with clear sectioned answers.' },
      { title: 'Smart summarizer', body: 'Paste or upload notes (PDF, Word, TXT) and get key points in seconds.' },
      { title: 'MCQ generator', body: 'Practice questions from a topic or notes, with the next question on demand.' },
      { title: 'Flashcards', body: 'Turn a topic or notes into flip-style revision cards.' },
      { title: '7-day study plan', body: 'A focused plan from subject, unit and topic ahead of a test.' },
      { title: 'Tied to the class', body: 'Every tool is scoped to the selected class, so answers stay relevant to what the student is studying.' },
    ],
    { cols: 3, y: 2.15, h: 2.15, titleSize: 13, bodySize: 10.5 }
  );
  infoBar(
    s,
    'Usage is controlled: AI is available only to actively enrolled students, history is saved per student, and each institute has a monthly AI quota - so costs stay predictable.',
    { y: 4.4 }
  );
  notes(s, [
    'Tie back to the owner: fewer "sir, I did not understand" messages at 10 pm; students self-serve first.',
    'Quotas matter for owners worried about open-ended AI cost.',
  ]);
});

function infoBar(s, text, { y, dark = false }) {
  s.addShape(pptx.ShapeType.roundRect, {
    x: MX,
    y,
    w: CW,
    h: 0.6,
    rectRadius: 0.08,
    fill: { color: dark ? C.darkCard : C.brandPale },
    line: { color: dark ? C.darkLine : C.brandPale, width: 0 },
  });
  s.addShape(pptx.ShapeType.rect, {
    x: MX,
    y: y + 0.12,
    w: 0.05,
    h: 0.36,
    fill: { color: C.brand },
    line: { color: C.brand, width: 0 },
  });
  s.addText(text, {
    x: MX + 0.2,
    y,
    w: CW - 0.35,
    h: 0.6,
    fontFace: FONT,
    fontSize: 10.5,
    color: dark ? C.slateLight : C.inkSoft,
    valign: 'middle',
    lineSpacingMultiple: 1.05,
  });
}

// 10. AI Copilot
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Pillar 3 - Improve (teachers)');
  heading(s, 'AI Copilot: prep in minutes, support the right students');
  lede(s, 'Lesson prep and intervention scale with class size, so teachers spend time teaching instead of writing quizzes and feedback.', { h: 0.6, w: 8.4 });
  cards(
    s,
    [
      { title: 'Quiz generator', body: 'Generate MCQs from a topic or lesson notes, review, then publish straight into a class quiz.' },
      { title: 'Feedback drafter', body: 'Rubric-style constructive feedback with a suggested grade, strengths and improvements.' },
      { title: 'Weak topic analysis', body: 'Class-wide quiz analysis: which topics students struggle with and where to focus next.' },
      { title: 'Intervention radar', body: 'Surfaces at-risk students with suggested next actions, ordered by priority.' },
    ],
    { cols: 4, y: 2.3, h: 1.9, titleSize: 12, bodySize: 9.5 }
  );
  infoBar(
    s,
    'Teachers see only their own classes; institute admins can use Copilot on any class. Every generated item is saved in a per-tool history for reuse.',
    { y: 4.4 }
  );
  notes(s, [
    'Demo moment: generate a 10-question quiz from a pasted paragraph, then publish it live.',
    'Weak-topic analysis is the bridge to the next slide on at-risk students.',
  ]);
});

// 11. At-risk and parent trust
defineSlide((ctx) => {
  const s = baseSlide({ ...ctx, dark: true });
  eyebrow(s, 'Early intervention', { dark: true });
  heading(s, 'Catch at-risk students before they drop', { dark: true });
  lede(s, 'Signals already in the system - attendance, submissions and quiz scores - turn into a short list, a follow-up record and a trusted update for parents.', {
    dark: true,
    h: 0.6,
    w: 8.4,
  });

  processFlow(
    s,
    [
      { title: 'Signal', body: 'At-risk panel flags students with low attendance, missing work or weak quiz scores (for example last 30 days).' },
      { title: 'Intervene', body: 'Teachers log interventions and track them: open, in progress, resolved or escalated.' },
      { title: 'Inform parents', body: 'Parent Trust Center: a time-limited, no-login link showing attendance, quiz results and fee status.' },
    ],
    { y: 2.3, h: 1.65, dark: true }
  );

  infoBar(
    s,
    'Students also see an AI study coach on their own dashboard with their weak topics and a one-click path into AI Study - so the student, the teacher and the parent all see the same picture.',
    { y: 4.2, dark: true }
  );

  notes(s, [
    'Retention is revenue: every student who drops is lost monthly fees. This is the business case for intervention.',
    'Parents never need an account - the link is tenant-scoped, expires, and shows read-only data.',
  ]);
});

// 12. Security
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Security and data protection');
  heading(s, 'Your data, isolated and protected');
  lede(s, 'Many institutes share one platform, but each institute\'s data is walled off and every request is checked against the signed-in user\'s institute and role.', {
    h: 0.6,
    w: 8.6,
  });
  cards(
    s,
    [
      {
        title: 'Isolated institute data',
        body: 'Every record is tagged to one institute and the data layer enforces that scope automatically on every read and write - the core guard against cross-institute leakage.',
      },
      {
        title: 'Role-based access',
        body: 'Admin, teacher and student roles with short-lived access tokens plus refresh tokens. A request for another institute is rejected even with a valid login.',
      },
      {
        title: 'Hardened platform',
        body: 'Passwords stored as salted hashes, security headers on every response, request rate limiting, and input validation on the API.',
      },
      {
        title: 'Content protection',
        body: 'Materials are rendered server-side into watermarked pages; originals are never served and download, right-click and drag are disabled in the viewer.',
      },
      {
        title: 'Payments under control',
        body: 'Bank slips are stored outside the web root and visible only to staff; PayHere payments are confirmed server-to-server.',
      },
      {
        title: 'Oversight and audit',
        body: 'Platform audit log, AI usage metering per institute, and tenant activation controls for the platform operator.',
      },
    ],
    { cols: 3, y: 2.15, h: 2.5, titleSize: 12, bodySize: 9.5 }
  );
  s.addText(
    'Note: view-only protection is a strong practical deterrent; no browser-based viewer can be 100% screenshot-proof.',
    {
      x: MX,
      y: 4.75,
      w: CW,
      h: 0.3,
      fontFace: FONT,
      fontSize: 9,
      italic: true,
      color: C.slate,
      valign: 'middle',
    }
  );
  notes(s, [
    'Keep it plain-language for owners; offer a technical deep-dive session for their IT contact if needed.',
    'Be honest about the limits of content protection - it builds trust and avoids a later complaint.',
    'Technical backing: row-level tenantId with an auto-scoping data client, JWT access + refresh, bcrypt, helmet, express-rate-limit, zod validation, server-rendered watermarked pages.',
  ]);
});

// 13. Why Mindspark
defineSlide((ctx) => {
  const s = baseSlide(ctx);
  eyebrow(s, 'Why Mindspark');
  heading(s, 'Not just another quiz-and-Zoom wrapper');
  lede(s, 'Four things that hold up in a live demo.', { h: 0.4 });
  cards(
    s,
    [
      {
        badge: '01',
        title: 'AI on both sides of the classroom',
        body: 'AI Study for students and AI Copilot for teachers - not a single chatbot bolted on.',
      },
      {
        badge: '02',
        title: 'Intervene early',
        body: 'At-risk detection, an intervention timeline and a parent link so support happens before dropout.',
      },
      {
        badge: '03',
        title: 'Built for local operations',
        body: 'Bank slips and PayHere, monthly fee rules, ID cards, guardian fields and a white-label landing page.',
      },
      {
        badge: '04',
        title: 'True multi-tenant SaaS',
        body: 'Isolated institute data on one scalable platform, with AI usage metered and visible per institute.',
      },
    ],
    { cols: 2, y: 2.05, h: 2.9, titleSize: 13.5, bodySize: 10.5 }
  );
  notes(s, [
    'If they are comparing with Google Classroom or a Zoom + Drive setup: fees, branding and parent visibility are the gaps those tools do not fill.',
  ]);
});

// 14. Next steps
defineSlide((ctx) => {
  const s = baseSlide({ ...ctx, dark: true, footer: false });
  slide_logoRow(s, { dark: true, x: MX, y: 0.55 });
  eyebrow(s, 'Next steps', { dark: true, y: 1.55 });
  heading(s, 'Ready when you are', { dark: true, y: 1.8, size: 30 });

  numberedList(
    s,
    [
      { title: 'Live demo', sub: 'Walk through your institute flow: branding, a class, a quiz, a payment, the parent link.' },
      { title: 'Map your setup', sub: 'Your classes, batches, fee rules and roles onto Mindspark - we help with the import.' },
      { title: 'Pilot one batch', sub: 'Run 2-4 weeks with one batch, measure fee collection, quiz completion and interventions, then scale.' },
    ],
    { y: 2.6, w: 5.6, rowH: 0.62, dark: true, size: 13.5 }
  );

  // CTA box
  s.addShape(pptx.ShapeType.roundRect, {
    x: 6.5,
    y: 2.55,
    w: 2.9,
    h: 1.95,
    rectRadius: 0.1,
    fill: { color: C.brand, transparency: 80 },
    line: { color: C.brand, width: 1 },
  });
  s.addText(
    [
      { text: 'Let\'s make teaching clearer and learning smarter.', options: { bold: true, color: C.brandPale, fontSize: 13, breakLine: true } },
      { text: ' ', options: { fontSize: 6, breakLine: true } },
      { text: 'Contact', options: { bold: true, color: C.brandLight, fontSize: 9, charSpacing: 2, breakLine: true } },
      { text: '[Name], [Role]', options: { color: 'F8FAFC', fontSize: 11, breakLine: true } },
      { text: '[email@yourdomain.com]', options: { color: C.slateLight, fontSize: 10.5, breakLine: true } },
      { text: '[+94 7X XXX XXXX]', options: { color: C.slateLight, fontSize: 10.5 } },
    ],
    { x: 6.7, y: 2.65, w: 2.55, h: 1.75, fontFace: FONT, valign: 'top', lineSpacingMultiple: 1.1 }
  );

  s.addText('Mindspark LMS - multi-tenant learning platform for institutes and tutors', {
    x: MX,
    y: H - 0.5,
    w: CW,
    h: 0.3,
    fontFace: FONT,
    fontSize: 9,
    color: C.slate,
    valign: 'middle',
  });

  notes(s, [
    'Replace the contact placeholders before sending the deck.',
    'Close by proposing a date for the live demo and asking who else should be in the room (head teacher, accounts).',
  ]);
});

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
const total = slideBuilders.length;
slideBuilders.forEach((fn, i) => fn({ index: i + 1, total }));

await pptx.writeFile({ fileName: OUT });
console.log(`Wrote ${OUT} (${total} slides)`);
