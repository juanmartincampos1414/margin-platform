import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant } from '@/lib/auth'

export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { recipeId, recipeName, totalCost, salePrice, grossMargin, ingredients } = await req.json()

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

    if (recipeId) {
      const supabase = await createClient()
      // Regenerating supersedes the previous batch for this recipe — the
      // Dashboard otherwise accumulates duplicate/stale recommendations
      // every time someone re-runs the analysis on the same dish.
      await supabase
        .from('ai_recommendations')
        .update({ status: 'dismissed' })
        .eq('recipe_id', recipeId)
        .eq('status', 'pending')

      const recommendations = data.recommendations || []
      if (recommendations.length > 0) {
        await supabase.from('ai_recommendations').insert(
          recommendations.map((r: any) => ({
            restaurant_id: restaurantId,
            recipe_id: recipeId,
            type: r.type,
            title: r.title,
            description: r.description,
            estimated_impact_pp: r.estimated_impact_pp,
            priority: r.priority,
            status: 'pending',
          }))
        )
      }
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
