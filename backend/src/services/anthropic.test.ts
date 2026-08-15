import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('anthropic diagnostics', () => {
  it('warns when API key is missing and returns null', async () => {
    vi.doMock('../config/env', () => ({
      env: { anthropicApiKey: '' },
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { callAnthropic } = await import('./anthropic');
    await expect(callAnthropic({ system: 's', user: 'u' })).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'));
  });

  it('warns on failed HTTP without leaking the prompt or key', async () => {
    vi.doMock('../config/env', () => ({
      env: { anthropicApiKey: 'test-key-should-not-leak' },
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'secret-provider-body',
      })
    );
    const { callAnthropic } = await import('./anthropic');
    await expect(
      callAnthropic({ system: 'sys', user: 'super-secret-prompt' })
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Anthropic HTTP 401'));
    const joined = warn.mock.calls.map((c) => String(c[0])).join(' ');
    expect(joined).not.toContain('super-secret-prompt');
    expect(joined).not.toContain('secret-provider-body');
    expect(joined).not.toContain('test-key-should-not-leak');
  });

  it('warns on network errors without leaking the prompt', async () => {
    vi.doMock('../config/env', () => ({
      env: { anthropicApiKey: 'test-key-should-not-leak' },
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down'))
    );
    const { callAnthropic } = await import('./anthropic');
    await expect(
      callAnthropic({ system: 'sys', user: 'super-secret-prompt' })
    ).resolves.toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[ai] Anthropic request failed:',
      'network down'
    );
    const joined = warn.mock.calls.flat().map(String).join(' ');
    expect(joined).not.toContain('super-secret-prompt');
  });
});
