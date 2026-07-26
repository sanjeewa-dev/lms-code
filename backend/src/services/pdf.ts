import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';

const IMAGE_MIME = /^image\//;
const PDF_MIME = 'application/pdf';

/**
 * Returns the number of "pages" for a stored file. Images count as a single
 * page; PDFs report their real page count.
 */
export async function getPageCount(buffer: Buffer, mimeType: string): Promise<number> {
  if (mimeType === PDF_MIME) {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return doc.getPageCount();
  }
  return 1;
}

/**
 * Renders a single page (1-indexed) of a material to a raster image and burns a
 * repeating diagonal watermark into it. The original file is never exposed to
 * the client, only these rendered, watermarked images.
 */
export async function renderWatermarkedPage(
  buffer: Buffer,
  mimeType: string,
  pageNumber: number,
  watermark: string
): Promise<Buffer> {
  let baseImage: Buffer;

  if (mimeType === PDF_MIME) {
    baseImage = await renderPdfPageToPng(buffer, pageNumber);
  } else if (IMAGE_MIME.test(mimeType)) {
    baseImage = buffer;
  } else {
    throw new Error(`Unsupported material type: ${mimeType}`);
  }

  const image = sharp(baseImage).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 1000;
  const height = meta.height ?? 1400;

  const overlay = Buffer.from(buildWatermarkSvg(width, height, watermark));

  return image
    .composite([{ input: overlay, blend: 'over' }])
    .jpeg({ quality: 82 })
    .toBuffer();
}

async function renderPdfPageToPng(buffer: Buffer, pageNumber: number): Promise<Buffer> {
  // pdf-to-img is ESM-only; import dynamically from this CommonJS module.
  const { pdf } = await import('pdf-to-img');
  const document = await pdf(buffer, { scale: 2 });

  let current = 0;
  for await (const page of document) {
    current += 1;
    if (current === pageNumber) {
      return page;
    }
  }
  throw new Error(`Page ${pageNumber} not found`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildWatermarkSvg(width: number, height: number, text: string): string {
  const safe = escapeXml(text);
  const fontSize = Math.max(18, Math.round(width / 28));
  const stepX = fontSize * 16;
  const stepY = fontSize * 8;
  const tiles: string[] = [];

  for (let y = 0; y < height + stepY; y += stepY) {
    for (let x = -stepX; x < width + stepX; x += stepX) {
      tiles.push(
        `<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${fontSize}" ` +
          `fill="#000000" fill-opacity="0.12" transform="rotate(-30 ${x} ${y})">${safe}</text>`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${tiles.join(
    ''
  )}</svg>`;
}
