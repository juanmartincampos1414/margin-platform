'use client'

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface Point {
  date: string
  price: number
}

export default function PriceEvolutionChart({ data }: { data: Point[] }) {
  if (data.length < 2) {
    return <p className="text-slate-400 text-sm py-8 text-center">Aún no hay suficiente historial de precios para graficar.</p>
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} />
        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} width={50} />
        <Tooltip
          formatter={(value) => [`$${Number(value ?? 0).toLocaleString('es-AR')}`, 'Precio']}
          labelStyle={{ fontSize: 12 }}
          contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
        />
        <Line type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  )
}
