import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Margin — Gestión Inteligente para Restaurantes',
  description: 'Plataforma de inteligencia de márgenes para restaurantes y hoteles',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
