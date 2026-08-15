import { env } from '../config/env';

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

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
      // Do not log the response body: providers may include request content in errors.
      console.warn(`[ai] Anthropic HTTP ${res.status}: ${res.statusText}`);
      return null;
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = data.content?.find((c) => c.type === 'text')?.text;
    return text?.trim() || null;
  } catch (err) {
    console.warn('[ai] Anthropic request failed:', err instanceof Error ? err.message : err);
    return null;
  }
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
