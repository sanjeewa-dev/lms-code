/** Shared HTML email chrome — table-based for client compatibility. */

const BRAND = '#0f766e'; // teal — distinct, professional, works in light inboxes
const BRAND_DARK = '#0d5c56';
const INK = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const SURFACE = '#f8fafc';

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function emailButton(label: string, url: string) {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
      <tr>
        <td align="center" bgcolor="${BRAND}" style="border-radius:8px;background:${BRAND};">
          <a href="${escapeHtml(url)}"
             style="display:inline-block;padding:14px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>`;
}

export function emailMutedLink(url: string, label = 'Or paste this link into your browser') {
  return `
    <p style="margin:12px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">
      ${escapeHtml(label)}:<br/>
      <a href="${escapeHtml(url)}" style="color:${BRAND};word-break:break-all;">${escapeHtml(url)}</a>
    </p>`;
}

export function emailParagraph(htmlOrText: string, opts?: { muted?: boolean }) {
  const color = opts?.muted ? MUTED : INK;
  const size = opts?.muted ? '13px' : '15px';
  return `<p style="margin:0 0 14px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:${size};line-height:1.6;color:${color};">${htmlOrText}</p>`;
}

export function emailDetailCard(rows: { label: string; value: string }[]) {
  const cells = rows
    .map(
      (r, i) => `
      <tr>
        <td style="padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};border-bottom:${i === rows.length - 1 ? 'none' : `1px solid ${BORDER}`};width:38%;vertical-align:top;">
          ${escapeHtml(r.label)}
        </td>
        <td style="padding:12px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${INK};border-bottom:${i === rows.length - 1 ? 'none' : `1px solid ${BORDER}`};vertical-align:top;">
          ${escapeHtml(r.value)}
        </td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="margin:8px 0 20px;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">
      ${cells}
    </table>`;
}

export function emailStatGrid(stats: { label: string; value: string }[]) {
  const cells = stats
    .map(
      (s) => `
      <td width="${Math.floor(100 / stats.length)}%" valign="top" style="padding:4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:#ffffff;border:1px solid ${BORDER};border-radius:10px;">
          <tr>
            <td style="padding:14px 12px;text-align:center;">
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:${MUTED};">
                ${escapeHtml(s.label)}
              </div>
              <div style="margin-top:6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${INK};line-height:1.2;">
                ${escapeHtml(s.value)}
              </div>
            </td>
          </tr>
        </table>
      </td>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
      <tr>${cells}</tr>
    </table>`;
}

export function emailBulletList(items: string[]) {
  if (!items.length) return '';
  const lis = items
    .map(
      (item) =>
        `<li style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:${INK};">${escapeHtml(item)}</li>`
    )
    .join('');
  return `<ul style="margin:0 0 18px;padding-left:20px;">${lis}</ul>`;
}

export function renderEmailLayout(opts: {
  instituteName: string;
  preheader?: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  secondaryCtaNote?: string;
  footerNote?: string;
}) {
  const {
    instituteName,
    preheader = '',
    eyebrow,
    title,
    bodyHtml,
    cta,
    secondaryCtaNote,
    footerNote,
  } = opts;

  const year = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};-webkit-text-size-adjust:100%;">
  ${
    preheader
      ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader)}</div>`
      : ''
  }
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};">
    <tr>
      <td align="center" style="padding:28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;margin:0 auto;">
          <tr>
            <td style="padding:0 4px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND};">
              ${escapeHtml(instituteName)}
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="height:4px;background:${BRAND};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <tr>
                  <td style="padding:28px 28px 8px;">
                    ${
                      eyebrow
                        ? `<p style="margin:0 0 8px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND};">${escapeHtml(eyebrow)}</p>`
                        : ''
                    }
                    <h1 style="margin:0 0 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;font-weight:700;color:${INK};">
                      ${escapeHtml(title)}
                    </h1>
                    ${bodyHtml}
                    ${cta ? emailButton(cta.label, cta.url) : ''}
                    ${cta ? emailMutedLink(cta.url, secondaryCtaNote || 'Or open this link') : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:8px 28px 28px;">
                    <p style="margin:16px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${MUTED};">
                      ${footerNote ? escapeHtml(footerNote) : `Sent by ${escapeHtml(instituteName)} via Mindspark LMS.`}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 4px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#94a3b8;">
              © ${year} ${escapeHtml(instituteName)} · Powered by Mindspark
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// Keep brand tokens available if needed elsewhere
export const emailBrand = { BRAND, BRAND_DARK, INK, MUTED, BORDER, SURFACE };
