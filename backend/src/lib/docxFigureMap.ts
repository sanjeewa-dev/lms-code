/**
 * Split mammoth HTML (images rewritten to src="figure://N") into per-question
 * figure index lists in document order. Figures that appear before the first
 * heading attach to the first question.
 */
export function figureIndicesPerQuestionBlock(html: string): number[][] {
  const withMarkers = html.replace(
    /<img\b[^>]*\bsrc=["']figure:\/\/(\d+)["'][^>]*>/gi,
    (_full, n: string) => `\n\0FIG:${n}\0\n`,
  );
  const text = withMarkers.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ');

  type Event = { pos: number; kind: 'q' } | { pos: number; kind: 'fig'; index: number };
  const events: Event[] = [];

  const questionRe = /(?:question|q)\s*(\d+)\b|(?:^|\n)\s*(\d{1,3})\s*[.)]\s+/gi;
  for (const match of text.matchAll(questionRe)) {
    events.push({ pos: match.index ?? 0, kind: 'q' });
  }
  for (const match of text.matchAll(/\0FIG:(\d+)\0/g)) {
    events.push({ pos: match.index ?? 0, kind: 'fig', index: Number(match[1]) });
  }
  events.sort((a, b) => a.pos - b.pos || (a.kind === 'fig' ? -1 : 1));

  const blocks: number[][] = [];
  let current: number[] | null = null;
  const preamble: number[] = [];

  for (const event of events) {
    if (event.kind === 'q') {
      current = [];
      if (preamble.length) {
        current.push(...preamble.splice(0, preamble.length));
      }
      blocks.push(current);
    } else if (current) {
      if (!current.includes(event.index)) current.push(event.index);
    } else if (!preamble.includes(event.index)) {
      preamble.push(event.index);
    }
  }

  if (!blocks.length && preamble.length) blocks.push(preamble);
  return blocks;
}
