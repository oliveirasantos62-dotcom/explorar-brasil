"use client";
import { useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

type Point = { period: string; value: number; region?: string };

export function IndicatorChart({ data, unit = "" }: { data: Point[]; unit?: string }) {
  const regions = useMemo(() => [...new Set(data.map((item) => item.region).filter((region): region is string => Boolean(region)))].sort((a, b) => a.localeCompare(b, "pt-BR")), [data]);
  const [region, setRegion] = useState(regions[0] ?? "Brasil");
  const activeRegion = regions.includes(region) ? region : regions[0];
  const filtered = useMemo(() => data.filter((item) => !item.region || item.region === activeRegion), [data, activeRegion]);
  if (!data.length) return <div className="empty">Ainda não existem observações para este indicador.</div>;
  return <>
    {regions.length > 1 && <div className="chart-region-filter"><label htmlFor="indicator-region">Unidade da Federação</label><select id="indicator-region" value={activeRegion} onChange={(event) => setRegion(event.target.value)}>{regions.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>}
    <div className="chartwrap"><ResponsiveContainer width="100%" height="100%"><LineChart data={filtered} margin={{ top: 10, right: 12, left: 0, bottom: 5 }}><CartesianGrid strokeDasharray="3 3" stroke="#e8edf5"/><XAxis dataKey="period" tick={{ fontSize: 11, fill: "#718096" }}/><YAxis tick={{ fontSize: 11, fill: "#718096" }} width={42}/><Tooltip formatter={(value) => [`${value} ${unit}`, "Valor"]}/><Line type="monotone" dataKey="value" name="Valor" stroke="#2457d6" strokeWidth={3} dot={{ r: 3, fill: "#2457d6" }} activeDot={{ r: 6 }}/></LineChart></ResponsiveContainer></div>
  </>;
}
