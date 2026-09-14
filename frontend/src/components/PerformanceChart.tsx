/** Smooth area performance chart (0–100%) — no chart library required. */

export type PerformancePoint = {
  label: string;
  percentage: number;
  classTitle?: string;
  score?: number;
  totalMarks?: number;
};

function truncate(label: string, max = 12) {
  const t = label.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Catmull-Rom → cubic Bezier path through points. */
function smoothLinePath(pts: { x: number; y: number }[]) {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function PerformanceChart({
  points,
  height = 260,
  color = '#14b8a6',
  emptyMessage = 'No graded quizzes or assignments yet. Complete work in your classes to see performance here.',
}: {
  points: PerformancePoint[];
  height?: number;
  /** Line/area stroke color */
  color?: string;
  emptyMessage?: string;
}) {
  if (!points.length) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  const pad = { top: 16, right: 12, bottom: 44, left: 36 };
  const width = Math.max(320, points.length * 72);
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? pad.left + innerW / 2
        : pad.left + (i / (points.length - 1)) * innerW;
    const y = pad.top + innerH - (Math.min(100, Math.max(0, p.percentage)) / 100) * innerH;
    return { x, y, ...p };
  });

  const line = smoothLinePath(coords.map(({ x, y }) => ({ x, y })));
  const area =
    coords.length === 1
      ? `M ${coords[0].x} ${pad.top + innerH} L ${coords[0].x} ${coords[0].y} L ${coords[0].x} ${pad.top + innerH} Z`
      : `${line} L ${coords[coords.length - 1].x} ${pad.top + innerH} L ${coords[0].x} ${pad.top + innerH} Z`;

  const yTicks = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  const stroke = color;
  const fillId = `perfAreaFill-${color.replace('#', '')}`;

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Performance chart"
        className="min-w-full"
      >
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {yTicks.map((t) => {
          const y = pad.top + innerH - (t / 100) * innerH;
          return (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="currentColor"
                className="text-slate-200 dark:text-white/10"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-slate-400 text-[10px]"
              >
                {t}
              </text>
            </g>
          );
        })}

        <path d={area} fill={`url(#${fillId})`} />
        <path d={line} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" />

        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={5} fill="#fff" stroke={stroke} strokeWidth={2.5} />
            <title>
              {c.label}: {c.percentage}%
              {c.score != null && c.totalMarks != null ? ` (${c.score}/${c.totalMarks})` : ''}
            </title>
            <text
              x={c.x}
              y={height - 10}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] dark:fill-slate-400"
            >
              {truncate(c.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
