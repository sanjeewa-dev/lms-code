import { describe, expect, it } from 'vitest';
import { figureIndicesPerQuestionBlock } from './docxFigureMap';
import { fileIdFromFigureUrl, questionFigureUrl } from './questionFigureUrl';
import { normalizeFigureBox } from './pageFigureCrop';

describe('figureIndicesPerQuestionBlock', () => {
  it('maps a figure under Q2, not Q1', () => {
    const html =
      '<p>Question 1. What is 2+2?</p><p>A. 3 B. 4</p>' +
      '<p>Question 2. See the diagram.</p><p><img src="figure://0"></p>';
    expect(figureIndicesPerQuestionBlock(html)).toEqual([[], [0]]);
  });

  it('attaches a preamble figure to the first question', () => {
    const html = '<p><img src="figure://0"></p><p>Q1 What is shown?</p><p>Q2 Text only</p>';
    expect(figureIndicesPerQuestionBlock(html)).toEqual([[0], []]);
  });

  it('keeps multiple figures on one question', () => {
    const html =
      '<p>1. First</p><img src="figure://0"><img src="figure://1"><p>2. Second</p>';
    expect(figureIndicesPerQuestionBlock(html)).toEqual([[0, 1], []]);
  });
});

describe('questionFigureUrl', () => {
  it('builds a tenant-relative stream path', () => {
    expect(questionFigureUrl('ictpasidu', 'abc123')).toBe(
      '/api/t/ictpasidu/question-figures/abc123',
    );
  });

  it('parses file id from a figure URL', () => {
    expect(fileIdFromFigureUrl('/api/t/ictpasidu/question-figures/abc123')).toBe('abc123');
    expect(fileIdFromFigureUrl('https://cdn.example/fig.png')).toBeNull();
  });
});

describe('normalizeFigureBox', () => {
  it('returns null when missing', () => {
    expect(normalizeFigureBox(null)).toBeNull();
  });

  it('clamps an oversized box onto the page', () => {
    const box = normalizeFigureBox({ x: 0.8, y: 0.8, w: 0.5, h: 0.5 });
    expect(box).not.toBeNull();
    expect(box!.x + box!.w).toBeLessThanOrEqual(1.02);
  });
});
