"use client";

export function Sparkline(props: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  const { data, width = 60, height = 20, color = "var(--primary)", className } = props;

  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min;
  const padding = 1.5;
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const points = data
    .map((value, index) => {
      const x = padding + (index / (data.length - 1)) * innerWidth;
      const y = range === 0
        ? height / 2
        : padding + ((max - value) / range) * innerHeight;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
    >
      <polyline
        fill="none"
        points={points}
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
