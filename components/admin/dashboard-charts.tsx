"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DaySeriesPoint } from "@/lib/admin/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const rupeesShort = (minor: number) => {
  const r = Math.round(minor / 100);
  return r >= 1000 ? `₹${(r / 1000).toFixed(r % 1000 ? 1 : 0)}k` : `₹${r}`;
};

export function DashboardCharts({ data }: { data: DaySeriesPoint[] }) {
  const chartData = data.map((d) => ({
    label: d.label,
    revenue: Math.round(d.revenueMinor / 100),
    bookings: d.bookings,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Revenue · last 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={1}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => rupeesShort(v * 100)}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(v) => [`₹${Number(v).toLocaleString("en-IN")}`, "Revenue"]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="revenue" fill="#0B1F3A" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Bookings · last 14 days
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval={1}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
                width={24}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                formatter={(v) => [String(v), "Bookings"]}
                labelStyle={{ fontSize: 12 }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="bookings" fill="#C89B53" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
