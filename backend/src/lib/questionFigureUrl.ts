/** Tenant-relative URL served by GET /api/t/:slug/question-figures/:fileId */
export function questionFigureUrl(slug: string, fileId: string): string {
  return `/api/t/${encodeURIComponent(slug)}/question-figures/${fileId}`;
}

export function fileIdFromFigureUrl(imageUrl: string): string | null {
  const match = imageUrl.match(/\/question-figures\/([^/?#]+)/);
  return match?.[1] ?? null;
}

export function figureImageCreate(tenantId: string, imageUrl: string, sortOrder: number) {
  return {
    tenantId,
    imageUrl,
    fileId: fileIdFromFigureUrl(imageUrl),
    sortOrder,
  };
}
