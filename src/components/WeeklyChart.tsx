import { useEffect, useRef, useState } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

const data = [
  { day: "Mon", score: 62 },
  { day: "Tue", score: 71 },
  { day: "Wed", score: 58 },
  { day: "Thu", score: 78 },
  { day: "Fri", score: 85 },
  { day: "Sat", score: 74 },
  { day: "Sun", score: 82 },
];

type WeeklyTooltipProps = {
  active?: boolean;
  payload?: Array<{ value?: string | number }>;
  label?: string | number;
};

const CustomTooltip = ({ active, payload, label }: WeeklyTooltipProps) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="surface-2 rounded-lg px-3 py-2 border border-border/50 shadow-lg">
      <p className="text-xs text-[hsl(var(--text-tertiary))] mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gold">{payload[0].value}</p>
    </div>
  );
};

const WeeklyChart = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={`transition-all duration-700 ${visible ? "opacity-100" : "opacity-0 translate-y-4"}`}>
      <p className="label-xs mb-6">Weekly Performance</p>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(43 56% 52%)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(43 56% 52%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }}
              domain={[40, 100]}
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Area
              type="monotone"
              dataKey="score"
              stroke="hsl(43 56% 52%)"
              strokeWidth={2}
              fill="url(#goldGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "hsl(43 56% 52%)",
                stroke: "hsl(0 0% 6%)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default WeeklyChart;
