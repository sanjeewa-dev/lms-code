import QRCode from 'qrcode';
import type { MaterialOrder } from '../api/types';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export type StudentPackage = {
  key: string;
  studentId: string | null;
  recipientName: string;
  email: string;
  phone: string;
  address: string;
  grade: string;
  orders: MaterialOrder[];
  materials: string[];
  relatedClasses: string[];
  orderNos: string[];
  shippingLabelNos: string[];
  primaryLabelNo: string | null;
  remarks: string;
};

export type PrintLabelsResult = { ok: true; count: number } | { ok: false; reason: 'empty' | 'popup_blocked' };

export type ShippingFromInfo = {
  name: string;
  phone?: string | null;
  address?: string | null;
  /** Data URL of teacher branding photo (fetched with auth before print). */
  photoDataUrl?: string | null;
  /** When true, print only the photo (plus a thin recipient strip). */
  photoOnly?: boolean;
};

/** Group orders by student so multiple slips ship as one package. */
export function groupOrdersByStudent(orders: MaterialOrder[]): StudentPackage[] {
  const map = new Map<string, MaterialOrder[]>();
  for (const o of orders) {
    const key = o.student?.id || `email:${o.email.toLowerCase()}` || o.id;
    const list = map.get(key) ?? [];
    list.push(o);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, group]) => {
      const sorted = [...group].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const first = sorted[0];
      const materials = [...new Set(sorted.flatMap((o) => o.materials))];
      const relatedClasses = [...new Set(sorted.flatMap((o) => o.relatedClasses))];
      const shippingLabelNos = sorted.map((o) => o.shippingLabelNo).filter(Boolean) as string[];
      const remarks = [...new Set(sorted.map((o) => o.remarks).filter(Boolean) as string[])].join(' · ') || 'No remark';
      return {
        key,
        studentId: first.student?.id ?? null,
        recipientName: first.recipientName,
        email: first.email,
        phone: first.phone,
        address: first.address,
        grade: [...new Set(sorted.map((o) => o.grade).filter(Boolean))].join(', '),
        orders: sorted,
        materials,
        relatedClasses,
        orderNos: sorted.map((o) => o.orderNo),
        shippingLabelNos,
        primaryLabelNo: shippingLabelNos[0] ?? null,
        remarks,
      };
    })
    .sort((a, b) => a.recipientName.localeCompare(b.recipientName));
}

export function downloadMaterialOrdersCsv(orders: MaterialOrder[], institute: string) {
  const header = [
    'Shipping label no',
    'Order no',
    'Name',
    'Grade',
    'Address',
    'Telephone no',
    'Ordered materials',
    'Related classes',
    'Email',
    'Remarks',
    'Status',
  ];
  const body = orders.map((o) => [
    o.shippingLabelNo ?? '',
    o.orderNo,
    o.recipientName,
    o.grade,
    o.address,
    o.phone,
    o.materials.join('; '),
    o.relatedClasses.join('; '),
    o.email,
    o.remarks ?? '',
    o.status,
  ]);
  const csv = [header, ...body]
    .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `Material Orders - ${institute}.csv`);
}

/** Modern A4 sheet: text 4-up, or landscape photo layout when teacher uploads a branding photo. */
export async function printShippingLabels(
  orders: MaterialOrder[],
  from: ShippingFromInfo = { name: 'Institute' }
): Promise<PrintLabelsResult> {
  const packages = groupOrdersByStudent(
    orders.filter((o) => Boolean(o.shippingLabelNo) || o.status === 'processing')
  );
  const printable = packages.filter((p) => p.orders.some((o) => o.shippingLabelNo));
  if (!printable.length) return { ok: false, reason: 'empty' };

  const withQr = await Promise.all(
    printable.map(async (p) => {
      const code = p.primaryLabelNo || p.shippingLabelNos[0] || p.orderNos[0] || p.key;
      const qrDataUrl = await QRCode.toDataURL(code, {
        margin: 0,
        width: 160,
        color: { dark: '#0f172a', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      });
      return { ...p, code, qrDataUrl };
    })
  );

  const dateSuffix = new Date().toISOString().slice(0, 10);
  const fileTitle = `Shipping Label ${dateSuffix}`;
  const photo = from.photoDataUrl?.trim() || '';
  const photoOnly = Boolean(photo && from.photoOnly);

  const html = photo
    ? buildPhotoLabelHtml(withQr, from, fileTitle, photo, photoOnly)
    : buildTextLabelHtml(withQr, from, fileTitle);

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    return { ok: false, reason: 'popup_blocked' };
  }

  const triggerPrint = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* ignore */
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (w.document.readyState === 'complete') {
    window.setTimeout(triggerPrint, 350);
  } else {
    w.addEventListener('load', () => window.setTimeout(triggerPrint, 350));
  }

  return { ok: true, count: printable.length };
}

type PackageWithQr = StudentPackage & { code: string; qrDataUrl: string };

function buildPhotoLabelHtml(
  packages: PackageWithQr[],
  from: ShippingFromInfo,
  fileTitle: string,
  photo: string,
  _photoOnly: boolean
) {
  /** One package = two grid cells: photo (left) + shipping label (right). */
  const pairHtml = (p: PackageWithQr) => {
    const multi = p.orders.length > 1;
    const orderId = p.orderNos.join(', ');
    const tuteCount =
      p.orders.reduce((n, o) => n + (o.materials?.length ?? 0), 0) || p.materials.length;
    const weightLabel = `${tuteCount * 75}g`;
    const shipDate = new Date().toISOString().slice(0, 10);
    const shipLines = [
      `<span class="party-name">${esc(p.recipientName)}</span>`,
      esc(p.address),
      p.phone ? `Tel: ${esc(p.phone)}` : '',
      p.grade ? `Grade: ${esc(p.grade)}` : '',
      multi ? `<span class="pkg-pill">${p.orders.length} orders · 1 package</span>` : '',
    ]
      .filter(Boolean)
      .join('<br/>');
    const senderLines = [
      `<span class="party-name">${esc(from.name)}</span>`,
      from.address ? esc(from.address) : '',
      from.phone ? `Tel: ${esc(from.phone)}` : '',
    ]
      .filter(Boolean)
      .join('<br/>');

    return `<div class="cell photo-cell">
  <img src="${photo}" alt="" />
</div>
<div class="cell delivery-cell">
  <div class="section">
    <div class="party-row">
      <div><span class="ship-badge">SHIP TO</span></div>
      <div class="party-body">${shipLines}</div>
    </div>
  </div>
  <div class="section">
    <div class="party-row">
      <div class="party-label">FROM</div>
      <div class="party-body">${senderLines}</div>
    </div>
  </div>
  <div class="section">
    <div class="meta-grid">
      <div>
        <span class="meta-label">ORDER ID</span>
        <p class="meta-value strong">${esc(orderId)}</p>
      </div>
      <div>
        <span class="meta-label">DIMENSIONS</span>
        <p class="meta-value">A4 size</p>
      </div>
      <div>
        <span class="meta-label">WEIGHT</span>
        <p class="meta-value strong">${esc(weightLabel)}</p>
      </div>
      <div>
        <span class="meta-label">SHIPPING DATE</span>
        <p class="meta-value">${shipDate}</p>
      </div>
      <div>
        <span class="meta-label">REMARKS</span>
        <p class="meta-value">${esc(p.remarks)}</p>
      </div>
      <div>
        <span class="meta-label">MATERIALS</span>
        <p class="meta-value">${p.materials.length ? esc(p.materials.join(', ')) : '—'}</p>
      </div>
    </div>
  </div>
  <div class="section code-section">
    <img src="${p.qrDataUrl}" alt="" />
    <div class="code-text">${esc(p.code)}</div>
  </div>
</div>`;
  };

  // 2 packages per page → 4 cells (photo|delivery, photo|delivery)
  const sheets = chunk(packages, 2)
    .map((group) => {
      const cells = group.map(pairHtml).join('');
      const emptyPairs = Math.max(0, 2 - group.length);
      const empties = Array.from({ length: emptyPairs * 2 })
        .map(() => '<div class="cell empty"></div>')
        .join('');
      return `<div class="sheet">
  <div class="cut-v"><span>✂ cut</span></div>
  <div class="cut-h"><span>✂ cut</span></div>
  ${cells}${empties}
</div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${fileTitle}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      color: #111;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 194mm;
      height: 281mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 6mm;
      page-break-after: always;
      position: relative;
    }
    .sheet:last-child { page-break-after: auto; }
    .cut-v, .cut-h {
      position: absolute;
      z-index: 2;
      pointer-events: none;
      color: #64748b;
      font-size: 7pt;
    }
    .cut-v {
      left: 50%;
      top: 0;
      bottom: 0;
      width: 1.5px;
      background: repeating-linear-gradient(to bottom, #64748b 0 3mm, transparent 3mm 5.5mm);
      transform: translateX(-50%);
    }
    .cut-h {
      top: 50%;
      left: 0;
      right: 0;
      height: 1.5px;
      background: repeating-linear-gradient(to right, #64748b 0 3mm, transparent 3mm 5.5mm);
      transform: translateY(-50%);
    }
    .cut-v span, .cut-h span {
      position: absolute;
      background: #fff;
      padding: 0 2mm;
      white-space: nowrap;
    }
    .cut-v span { top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-90deg); }
    .cut-h span { left: 50%; top: 50%; transform: translate(-50%, -50%); }
    .cell {
      border: 1.5pt solid #111;
      border-radius: 2mm;
      overflow: hidden;
      background: #fff;
      min-height: 0;
      min-width: 0;
      position: relative;
      z-index: 1;
    }
    .empty { border-style: dashed; border-color: #94a3b8; opacity: 0.45; }

    .photo-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #fff;
    }
    .photo-cell img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      object-position: center center;
      display: block;
    }

    .delivery-cell {
      padding: 0;
      display: flex;
      flex-direction: column;
      font-size: 8pt;
      line-height: 1.3;
    }
    .delivery-cell .section {
      padding: 3mm 3.5mm;
      border-bottom: 1.25pt solid #111;
    }
    .delivery-cell .section:last-child {
      border-bottom: none;
      margin-top: auto;
    }
    .party-row {
      display: grid;
      grid-template-columns: 18mm 1fr;
      gap: 2.5mm;
      align-items: start;
    }
    .ship-badge {
      display: inline-block;
      background: #000 !important;
      color: #fff !important;
      font-size: 6.5pt;
      font-weight: 800;
      letter-spacing: 0.05em;
      padding: 1mm 2mm;
      border-radius: 2.5px;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .party-label {
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding-top: 1px;
    }
    .party-body {
      min-width: 0;
      font-size: 8pt;
      word-break: break-word;
    }
    .party-name {
      display: block;
      font-size: 9.5pt;
      font-weight: 800;
      margin-bottom: 0.6mm;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2mm 3mm;
    }
    .meta-label {
      display: block;
      font-size: 6.5pt;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 0.4mm;
    }
    .meta-value {
      margin: 0;
      font-size: 7.5pt;
      word-break: break-word;
    }
    .meta-value.strong { font-weight: 700; }
    .pkg-pill {
      display: inline-block;
      margin-top: 1mm;
      font-size: 6.5pt;
      font-weight: 700;
      border: 1pt dashed #111;
      border-radius: 999px;
      padding: 0.4mm 1.5mm;
    }
    .code-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1mm;
      padding: 3mm !important;
      min-height: 22mm;
    }
    .code-section img { width: 18mm; height: 18mm; }
    .code-text {
      font-family: ui-monospace, Consolas, monospace;
      font-size: 7pt;
      font-weight: 700;
    }
  </style>
</head>
<body>
${sheets}
</body>
</html>`;
}

function buildTextLabelHtml(packages: PackageWithQr[], from: ShippingFromInfo, fileTitle: string) {
  const shipDate = new Date().toISOString().slice(0, 10);
  const TUTE_G = 75;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${fileTitle}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, Helvetica, sans-serif;
      color: #000;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      column-gap: 8mm;
      row-gap: 8mm;
      width: 100%;
      height: 281mm;
      page-break-after: always;
      position: relative;
    }
    .sheet:last-child { page-break-after: auto; }
    .cut-v, .cut-h {
      position: absolute;
      z-index: 2;
      pointer-events: none;
      color: #64748b;
      font-size: 7pt;
    }
    .cut-v {
      left: 50%;
      top: 0;
      bottom: 0;
      width: 1.5px;
      background: repeating-linear-gradient(to bottom, #64748b 0 3mm, transparent 3mm 5.5mm);
      transform: translateX(-50%);
    }
    .cut-h {
      top: 50%;
      left: 0;
      right: 0;
      height: 1.5px;
      background: repeating-linear-gradient(to right, #64748b 0 3mm, transparent 3mm 5.5mm);
      transform: translateY(-50%);
    }
    .cut-v span, .cut-h span {
      position: absolute;
      background: #fff;
      padding: 0 2mm;
      white-space: nowrap;
    }
    .cut-v span { top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-90deg); }
    .cut-h span { left: 50%; top: 50%; transform: translate(-50%, -50%); }
    .label {
      border: 2px solid #000;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #fff;
      position: relative;
      z-index: 1;
    }
    .section {
      padding: 4mm 5mm;
      border-bottom: 1.5px solid #000;
    }
    .section:last-child {
      border-bottom: none;
      margin-top: auto;
    }
    .party-row {
      display: grid;
      grid-template-columns: 20mm 1fr;
      gap: 3mm;
      align-items: start;
    }
    .ship-badge {
      display: inline-block;
      background: #000 !important;
      color: #fff !important;
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 1.2mm 2.4mm;
      border-radius: 3px;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .party-label {
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.08em;
      color: #000 !important;
      padding-top: 1px;
      text-transform: uppercase;
    }
    .party-body {
      min-width: 0;
      font-size: 9pt;
      font-weight: 400;
      line-height: 1.35;
      color: #000 !important;
      margin: 0;
      word-break: break-word;
    }
    .party-name {
      display: block;
      font-size: 10pt;
      font-weight: 700;
      color: #000 !important;
      margin: 0 0 1mm;
      line-height: 1.25;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2.5mm 4mm;
    }
    .meta-label {
      display: block;
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      color: #000 !important;
      margin-bottom: 0.6mm;
      text-transform: uppercase;
    }
    .meta-value {
      font-size: 8.5pt;
      line-height: 1.35;
      color: #000 !important;
      margin: 0;
      word-break: break-word;
    }
    .meta-value.strong { font-weight: 700; }
    .mats {
      margin-top: 2.5mm;
      font-size: 8pt;
      color: #000 !important;
      line-height: 1.3;
    }
    .mats strong {
      display: block;
      font-size: 7.5pt;
      letter-spacing: 0.06em;
      color: #000 !important;
      margin-bottom: 0.6mm;
      text-transform: uppercase;
      font-weight: 800;
    }
    .code-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2mm;
      padding: 4mm;
      min-height: 28mm;
    }
    .code-section img { width: 22mm; height: 22mm; }
    .code-text {
      font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
      font-size: 8pt;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #000;
    }
    .pkg-pill {
      display: inline-block;
      margin-top: 1.5mm;
      font-size: 7pt;
      font-weight: 700;
      border: 1.5px dashed #000;
      border-radius: 999px;
      padding: 0.8mm 2.5mm;
      color: #000;
    }
    .empty {
      border: 2px dashed #94a3b8;
      border-radius: 8px;
      opacity: 0.45;
      position: relative;
      z-index: 1;
    }
  </style>
</head>
<body>
${chunk(packages, 4)
  .map(
    (group) => `<div class="sheet">
  <div class="cut-v"><span>✂ cut</span></div>
  <div class="cut-h"><span>✂ cut</span></div>
${group
  .map((p) => {
    const multi = p.orders.length > 1;
    const orderId = p.orderNos.join(', ');
    const tuteCount =
      p.orders.reduce((n, o) => n + (o.materials?.length ?? 0), 0) || p.materials.length;
    const weightG = tuteCount * TUTE_G;
    const weightLabel = `${weightG}g`;
    const shipLines = [
      `<span class="party-name">${esc(p.recipientName)}</span>`,
      esc(p.address),
      p.phone ? `Tel: ${esc(p.phone)}` : '',
      multi ? `<span class="pkg-pill">${p.orders.length} orders · 1 package</span>` : '',
    ]
      .filter(Boolean)
      .join('<br/>');
    const senderLines = [
      `<span class="party-name">${esc(from.name)}</span>`,
      from.address ? esc(from.address) : '',
      from.phone ? `Tel: ${esc(from.phone)}` : '',
    ]
      .filter(Boolean)
      .join('<br/>');
    return `<div class="label">
  <div class="section">
    <div class="party-row">
      <div><span class="ship-badge">SHIP TO</span></div>
      <div class="party-body">${shipLines}</div>
    </div>
  </div>
  <div class="section">
    <div class="party-row">
      <div class="party-label">FROM</div>
      <div class="party-body">${senderLines}</div>
    </div>
  </div>
  <div class="section">
    <div class="meta-grid">
      <div>
        <span class="meta-label">ORDER ID</span>
        <p class="meta-value strong">${esc(orderId)}</p>
      </div>
      <div>
        <span class="meta-label">DIMENSIONS</span>
        <p class="meta-value">A4 size</p>
      </div>
      <div>
        <span class="meta-label">WEIGHT</span>
        <p class="meta-value strong">${esc(weightLabel)}</p>
      </div>
      <div>
        <span class="meta-label">SHIPPING DATE</span>
        <p class="meta-value">${shipDate}</p>
      </div>
      <div>
        <span class="meta-label">REMARKS</span>
        <p class="meta-value">${esc(p.remarks)}</p>
      </div>
      <div>
        <span class="meta-label">MATERIALS</span>
        <p class="meta-value">${p.materials.length ? esc(p.materials.join(', ')) : '—'}</p>
      </div>
    </div>
  </div>
  <div class="section code-section">
    <img src="${p.qrDataUrl}" alt="Label code" />
    <div class="code-text">${esc(p.code)}</div>
  </div>
</div>`;
  })
  .join('')}
${Array.from({ length: Math.max(0, 4 - group.length) })
  .map(() => '<div class="empty"></div>')
  .join('')}
</div>`
  )
  .join('')}
</body>
</html>`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
