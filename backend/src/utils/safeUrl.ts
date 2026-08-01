import net from 'net';
import { badRequest } from './httpError';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata',
]);

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  const ranges: Array<[number, number]> = [
    [ipv4ToInt('0.0.0.0'), ipv4ToInt('0.255.255.255')],
    [ipv4ToInt('10.0.0.0'), ipv4ToInt('10.255.255.255')],
    [ipv4ToInt('127.0.0.0'), ipv4ToInt('127.255.255.255')],
    [ipv4ToInt('169.254.0.0'), ipv4ToInt('169.254.255.255')],
    [ipv4ToInt('172.16.0.0'), ipv4ToInt('172.31.255.255')],
    [ipv4ToInt('192.168.0.0'), ipv4ToInt('192.168.255.255')],
  ];
  return ranges.some(([start, end]) => n >= start && n <= end);
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (net.isIP(host) === 4) return isPrivateIpv4(host);
  if (net.isIP(host) === 6) {
    const normalized = host.toLowerCase();
    return (
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe80')
    );
  }
  return false;
}

/**
 * Validates an outbound URL for server-side fetch (SSRF hardening).
 * Only https is allowed; private/link-local/metadata hosts are blocked.
 */
export function assertSafeOutboundUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw badRequest('Invalid URL');
  }
  if (url.protocol !== 'https:') {
    throw badRequest('Only https URLs are allowed');
  }
  if (isBlockedHost(url.hostname)) {
    throw badRequest('URL host is not allowed');
  }
  return url;
}

/** HTTPS-only public URL (e.g. recording links shown to students). */
export function assertHttpsPublicUrl(raw: string): string {
  const url = assertSafeOutboundUrl(raw);
  return url.toString();
}
