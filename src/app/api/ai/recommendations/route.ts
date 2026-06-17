import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export async function POST(req: Request) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { recipeName, totalCost, salePrice, grossMargin, ingredients } = await req.json()

  const ingredientList = ingredients
    .map((i: any) => `  - ${i.name}: $${i.cost.toFixed(0)} (${i.pct.toFixed(1)}% del costo)`)
    .join('\n')

  const prompt = `Sos un consultor experto en rentabilidad gastronómica. Analizá este plato y dá recomendaciones concretas y accionables en JSON.

PLATO: ${recipeName}
Precio de venta: $${salePrice}
Costo total: $${totalCost.toFixed(0)}
Margen bruto: ${grossMargin.toFixed(1)}%

Composición de costos:
${ingredientList}

Respondé ÚNICAMENTE con un JSON válido con esta estructura:
{
  "recommendations": [
    {
      "type": "negotiate_supplier|adjust_price|review_ingredient|menu_mix",
      "title": "Acción concreta corta",
      "description": "Explicación de 1-2 oraciones de por qué y cómo hacerlo",
      "estimated_impact_pp": <número de puntos porcentuales de mejora estimada>,
      "priority": "high|medium|low"
    }
  ]
}

Reglas:
- Máximo 3-4 recomendaciones
- Solo acciones concretas y realizables
- Si el margen supera 60%, destacar lo que está bien y dar solo 1-2 sugerencias de optimización
- estimated_impact_pp debe ser un número realista (no mayor a 15)
- priority: "high" si el ingrediente cuesta más del 40% del total o el margen es < 35%`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = (message.content[0] as any).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in response')

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
