import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function mockPrisma() {
  return {
    emailLog: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe('resolveCommunicationsUrl', () => {
  it('maps local and deployed origins to POST /v1/communications', async () => {
    vi.doMock('../config/env', () => ({
      env: { nms: { baseUrl: '', jwtHs256Secret: '' } },
    }));
    vi.doMock('../lib/prisma', () => ({ basePrisma: mockPrisma() }));
    const { resolveCommunicationsUrl } = await import('./nmsClient');
    expect(resolveCommunicationsUrl('http://localhost:8080')).toBe(
      'http://localhost:8080/v1/communications',
    );
    expect(resolveCommunicationsUrl('http://localhost:8080/')).toBe(
      'http://localhost:8080/v1/communications',
    );
    expect(resolveCommunicationsUrl('https://nms.example.com')).toBe(
      'https://nms.example.com/v1/communications',
    );
    expect(resolveCommunicationsUrl('https://nms.example.com/v1/communications')).toBe(
      'https://nms.example.com/v1/communications',
    );
  });
});

describe('dispatchCommunication', () => {
  it('skips when NMS_BASE_URL is unset and does not call fetch', async () => {
    const prisma = mockPrisma();
    vi.doMock('../config/env', () => ({
      env: { nms: { baseUrl: '', jwtHs256Secret: '' } },
    }));
    vi.doMock('../lib/prisma', () => ({ basePrisma: prisma }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { dispatchCommunication } = await import('./nmsClient');
    await dispatchCommunication({
      tenantId: 'ten_1',
      templateId: 'class.invite',
      idempotencyKey: 'ten_1:invite:inv_1:v1',
      header: { subjectLine: "You're invited to join Math 101 at Acme" },
      content: { inviteUrl: 'https://lms.example.com/invite/secret-token' },
      receivers: [{ name: 'Jane', email: 'jane@example.com' }],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'skipped', to: 'jane@example.com' }),
      }),
    );
    const joined = warn.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(joined).not.toContain('secret-token');
  });

  it('posts a 202 payload with email channel object and does not log tokens', async () => {
    const prisma = mockPrisma();
    vi.doMock('../config/env', () => ({
      env: { nms: { baseUrl: 'http://localhost:8080', jwtHs256Secret: 'test-secret-32-chars-minimum-ok' } },
    }));
    vi.doMock('../lib/prisma', () => ({ basePrisma: prisma }));
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      json: async () => ({ id: 'nti_01TEST' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { dispatchCommunication } = await import('./nmsClient');
    await dispatchCommunication({
      tenantId: 'ten_1',
      templateId: 'class.invite',
      idempotencyKey: 'ten_1:invite:inv_1:v1',
      header: { subjectLine: "You're invited" },
      content: { inviteUrl: 'https://lms.example.com/invite/secret-token' },
      receivers: [{ name: 'Jane', email: 'jane@example.com' }],
      relatedType: 'student_invite',
      relatedId: 'inv_1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8080/v1/communications');
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Idempotency-Key']).toBe('ten_1:invite:inv_1:v1');
    expect(headers.Authorization).toMatch(/^Bearer /);
    const body = JSON.parse(String(init.body)) as {
      templateId: string;
      channel: { email: boolean; sms: boolean };
      receiver: { email: string }[];
      content: { inviteUrl: string };
    };
    expect(body.templateId).toBe('class.invite');
    expect(body.channel).toEqual({ email: true, sms: false });
    expect(body.receiver[0].email).toBe('jane@example.com');
    expect(prisma.emailLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent', providerId: 'nti_01TEST' }),
      }),
    );
    const joined = [...warn.mock.calls, ...log.mock.calls].map((c) => JSON.stringify(c)).join(' ');
    expect(joined).not.toContain('secret-token');
    expect(joined).not.toContain(headers.Authorization);
  });

  it('chunks receivers over 100 and suffixes idempotency keys', async () => {
    const prisma = mockPrisma();
    vi.doMock('../config/env', () => ({
      env: { nms: { baseUrl: 'http://localhost:8080', jwtHs256Secret: '' } },
    }));
    vi.doMock('../lib/prisma', () => ({ basePrisma: prisma }));
    const fetchMock = vi.fn().mockResolvedValue({
      status: 202,
      json: async () => ({ id: 'nti_chunk' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { dispatchCommunication, NMS_MAX_RECEIVERS } = await import('./nmsClient');
    const receivers = Array.from({ length: NMS_MAX_RECEIVERS + 1 }, (_, i) => ({
      name: `S${i}`,
      email: `s${i}@example.com`,
    }));

    await dispatchCommunication({
      tenantId: 'ten_1',
      templateId: 'session.live_started',
      idempotencyKey: 'ten_1:live-start:sch_1:v1',
      receivers,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const key0 = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    const key1 = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>;
    expect(key0['X-Idempotency-Key']).toBe('ten_1:live-start:sch_1:v1:c0');
    expect(key1['X-Idempotency-Key']).toBe('ten_1:live-start:sch_1:v1:c1');
    expect(key0.Authorization).toBeUndefined();
    const body0 = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)) as {
      receiver: unknown[];
    };
    expect(body0.receiver).toHaveLength(NMS_MAX_RECEIVERS);
  });
});
