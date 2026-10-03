import {
  AreaChart,
  Area,
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { ChartPoint } from '../types';
export function ResponseTimeChart({ points, days = 1 }: { points: ChartPoint[]; days?: number }) {
  if (!points.length)
    return <div className="chart-empty">Response times will appear after the first check.</div>;
  return (
    <div className="response-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 15, right: 14, left: -17, bottom: 0 }}>
          <defs>
            <linearGradient id="responseFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9275ec" stopOpacity={0.19} />
              <stop offset="100%" stopColor="#9275ec" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="var(--line)" />
          <XAxis
            dataKey="time"
            axisLine={false}
            tickLine={false}
            minTickGap={45}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickFormatter={(v) =>
              new Date(String(v)).toLocaleString('en-US', {
                timeZone: 'UTC',
                ...(days === 1
                  ? { hour: '2-digit', minute: '2-digit', hour12: false }
                  : { month: 'short', day: 'numeric' }),
              })
            }
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickFormatter={(v) => `${v}`}
            width={50}
          />
          <Tooltip
            contentStyle={{
              border: '1px solid var(--line)',
              borderRadius: 10,
              background: 'var(--surface)',
              fontSize: 12,
              color: 'var(--text)',
            }}
            labelFormatter={(v) =>
              `${new Date(String(v)).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`
            }
            formatter={(v) => [`${v} ms`, 'Response time']}
          />
          <Area
            type="monotone"
            dataKey="responseMs"
            stroke="#9879ee"
            strokeWidth={2.5}
            fill="url(#responseFill)"
            animationDuration={500}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
