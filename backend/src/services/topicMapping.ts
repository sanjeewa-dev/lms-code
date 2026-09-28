/**
 * Build Quiz.topicMapping from question topics.
 * Shape: { entries: [{ topic: string, questionNumbers: number[] }] }
 * questionNumbers are 1-based order indices.
 */
export function buildTopicMapping(
  questions: { topic?: string | null; order: number }[]
): { entries: { topic: string; questionNumbers: number[] }[] } {
  const byTopic = new Map<string, number[]>();
  const sorted = [...questions].sort((a, b) => a.order - b.order);
  sorted.forEach((q, index) => {
    const topic = (q.topic?.trim() || 'General');
    const list = byTopic.get(topic) ?? [];
    list.push(index + 1);
    byTopic.set(topic, list);
  });
  return {
    entries: [...byTopic.entries()].map(([topic, questionNumbers]) => ({
      topic,
      questionNumbers,
    })),
  };
}

export type TopicBreakdown = Record<
  string,
  { correct: number; total: number; percentage: number }
>;

export function aggregateTopicBreakdown(
  rows: { topic: string; correct: boolean }[]
): TopicBreakdown {
  const map: Record<string, { correct: number; total: number }> = {};
  for (const row of rows) {
    const topic = row.topic?.trim() || 'General';
    if (!map[topic]) map[topic] = { correct: 0, total: 0 };
    map[topic].total += 1;
    if (row.correct) map[topic].correct += 1;
  }
  const out: TopicBreakdown = {};
  for (const [topic, v] of Object.entries(map)) {
    out[topic] = {
      ...v,
      percentage: v.total > 0 ? Math.round((v.correct / v.total) * 1000) / 10 : 0,
    };
  }
  return out;
}

/** Deterministic shuffle seeded by attempt id (stable across reloads). */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  const arr = [...items];
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const rand = () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
