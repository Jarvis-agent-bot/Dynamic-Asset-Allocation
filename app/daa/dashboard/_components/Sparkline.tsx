"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

export function Sparkline(props: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}) {
  const { data, width = 60, height = 20, color = "hsl(188 95% 60%)", className } = props;

  if (data.length < 2) return null;

  const points = data.map((v, i) => ({ i, v }));

  return (
    <div className={className} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 1, right: 1, bottom: 1, left: 1 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
