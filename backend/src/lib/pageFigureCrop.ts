import sharp from 'sharp';

export type FigureBox = { x: number; y: number; w: number; h: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeFigureBox(box: FigureBox | null | undefined): FigureBox | null {
  if (!box) return null;
  const x = clamp(box.x, 0, 0.95);
  const y = clamp(box.y, 0, 0.95);
  const w = clamp(box.w, 0.05, 1);
  const h = clamp(box.h, 0.05, 1);
  if (x + w > 1.02 || y + h > 1.02) {
    return { x, y, w: clamp(1 - x, 0.05, 1), h: clamp(1 - y, 0.05, 1) };
  }
  return { x, y, w, h };
}

/** Crop a page raster to a figure. Invalid/missing box uses an 8% inset of the page. */
export async function cropPageFigure(page: Buffer, box?: FigureBox | null): Promise<Buffer> {
  const meta = await sharp(page).metadata();
  const width = meta.width;
  const height = meta.height;
  if (!width || !height) return page;

  const normalized = normalizeFigureBox(box);
  let left: number;
  let top: number;
  let cropW: number;
  let cropH: number;

  if (normalized) {
    left = Math.floor(normalized.x * width);
    top = Math.floor(normalized.y * height);
    cropW = Math.floor(normalized.w * width);
    cropH = Math.floor(normalized.h * height);
  } else {
    const padX = Math.floor(width * 0.08);
    const padY = Math.floor(height * 0.08);
    left = padX;
    top = padY;
    cropW = width - 2 * padX;
    cropH = height - 2 * padY;
  }

  left = clamp(left, 0, width - 2);
  top = clamp(top, 0, height - 2);
  cropW = clamp(cropW, 2, width - left);
  cropH = clamp(cropH, 2, height - top);

  return sharp(page)
    .extract({ left, top, width: cropW, height: cropH })
    .jpeg({ quality: 85 })
    .toBuffer();
}
