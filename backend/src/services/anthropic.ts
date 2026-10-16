import { env } from '../config/env';
import { withAiConcurrency } from '../lib/aiConcurrency';
import { HttpError } from '../utils/httpError';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
/** Prefer ScoreSmart’s vision model; fall back to the same Haiku used elsewhere in LMS. */
const VISION_MODEL =
  process.env.ANTHROPIC_VISION_MODEL?.trim() || 'claude-sonnet-4-6';

/** Call Anthropic Messages API. Returns text content or null on failure / missing key. */
export async function callAnthropic(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
}): Promise<string | null> {
  if (!env.anthropicApiKey) {
    console.warn('[ai] ANTHROPIC_API_KEY is not set — AI features are disabled');
    return null;
  }
  try {
    return await withAiConcurrency(async () => {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: opts.model ?? DEFAULT_MODEL,
          max_tokens: opts.maxTokens ?? 800,
          system: opts.system,
          messages: [{ role: 'user', content: opts.user }],
        }),
      });
      if (!res.ok) {
        console.warn(`[ai] Anthropic HTTP ${res.status}: ${res.statusText}`);
        return null;
      }
      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      const text = data.content?.find((c) => c.type === 'text')?.text;
      return text?.trim() || null;
    });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.warn('[ai] Anthropic request failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** Vision (or text) call with higher token budget for paper extraction. Throws on hard failures. */
export async function callAnthropicForExtraction(opts: {
  system: string;
  prompt: string;
  image?: { base64: string; mediaType: 'image/jpeg' | 'image/png' };
  maxTokens?: number;
}): Promise<string> {
  if (!env.anthropicApiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured — cannot extract questions from papers');
  }
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  > = [];
  if (opts.image) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: opts.image.mediaType,
        data: opts.image.base64,
      },
    });
  }
  content.push({ type: 'text', text: opts.prompt });

  const models = [...new Set([VISION_MODEL, DEFAULT_MODEL, 'claude-3-5-sonnet-20241022'])];
  let lastError = 'Anthropic extraction failed';

  return withAiConcurrency(async () => {
    for (const model of models) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 8192,
          system: opts.system,
          messages: [{ role: 'user', content }],
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          content?: { type: string; text?: string }[];
        };
        const text = data.content?.find((c) => c.type === 'text')?.text?.trim();
        if (!text) throw new Error('Empty response from vision model');
        return text;
      }

      const body = await res.text().catch(() => '');
      lastError = `Anthropic extraction failed (${res.status}): ${body.slice(0, 200) || res.statusText}`;
      if (res.status !== 404 && !body.includes('not_found_error')) {
        throw new Error(lastError);
      }
      console.warn(`[ai] model ${model} unavailable, trying fallback…`);
    }

    throw new Error(lastError);
  });
}

export function parseJsonObject<T extends Record<string, unknown>>(raw: string): T | null {
  const match = raw.trim().match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
