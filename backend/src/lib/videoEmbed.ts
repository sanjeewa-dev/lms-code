import type { VideoProvider } from '@prisma/client';

const YOUTUBE_ID =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YOUTUBE_ID);
  return match?.[1] ?? null;
}

export function extractVimeoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('vimeo.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id ?? null;
  } catch {
    return null;
  }
}

export function buildEmbedPlayUrl(provider: VideoProvider, videoUrl: string): string {
  if (provider === 'youtube') {
    const id = extractYouTubeId(videoUrl);
    if (!id) throw new Error('Invalid YouTube URL');
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
  }
  if (provider === 'vimeo') {
    const id = extractVimeoId(videoUrl);
    if (!id) throw new Error('Invalid Vimeo URL');
    return `https://player.vimeo.com/video/${id}?dnt=1`;
  }
  throw new Error('Unsupported embed provider');
}
