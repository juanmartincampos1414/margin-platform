import Link from 'next/link'
import Image from 'next/image'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-slate-800">
        <div className="flex items-center">
          <Image src="/logo.png" alt="Margin" width={120} height={60} className="object-contain" priority />
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-slate-400 hover:text-white text-sm transition-colors">Iniciar sesión</Link>
          <Link href="/registro" className="bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors">Comenzar gratis</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-8 pt-24 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 text-indigo-400 text-sm mb-8">
          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full inline-block"></span>
          Capa de gestión económica inteligente
        </div>
        <h1 className="text-5xl font-bold leading-tight mb-6">
          No es solo software.<br />
          Es el <span className="text-indigo-400">sistema nervioso</span><br />
          de tu negocio gastronómico.
        </h1>
        <p className="text-slate-400 text-xl mb-10 max-w-2xl mx-auto">
          Entendé el margen real de cada plato. Tomá decisiones sobre lo que importa.
          Para restaurantes y hoteles.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/registro" className="bg-indigo-500 hover:bg-indigo-600 px-8 py-3 rounded-xl font-semibold text-lg transition-colors">
            Empezar gratis →
          </Link>
          <Link href="/login" className="text-slate-400 hover:text-white px-8 py-3 rounded-xl font-semibold text-lg border border-slate-700 hover:border-slate-500 transition-colors">
            Ya tengo cuenta
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { icon: '📊', title: 'Margen por plato en tiempo real', desc: 'Costo, precio, margen bruto y neto actualizados automáticamente con cada cambio de ingrediente.' },
          { icon: '🤖', title: 'IA que recomienda acciones', desc: 'Detecta qué afecta tu margen y sugiere negociar con proveedores, ajustar precios o revisar recetas.' },
          { icon: '📄', title: 'OCR inteligente de facturas', desc: 'Subí una foto de factura y extraemos todos los datos automáticamente. Detectamos cambios de precio al instante.' },
        ].map((f) => (
          <div key={f.title} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="text-3xl mb-4">{f.icon}</div>
            <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      <div className="text-center pb-12 text-slate-600 text-sm tracking-widest">
        DATA → INTELIGENCIA → DECISIONES → RESULTADOS
      </div>
    </div>
  )
}
