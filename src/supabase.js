import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function saveAnalisis({ email, analisis, inputMode, qaContexto, consentimiento }) {
  const { data, error } = await supabase
    .from('analisis')
    .insert({
      nombre_completo:      analisis?.nombre_completo || null,
      email:                email || null,
      input_mode:           inputMode,
      qa_contexto:          qaContexto || [],
      puntaje_general:      analisis?.puntaje_general ?? null,
      nivel_seo:            analisis?.nivel_seo || null,
      resumen_diagnostico:  analisis?.resumen_diagnostico || null,
      accion_prioritaria:   analisis?.accion_prioritaria || null,
      fortalezas:           analisis?.fortalezas || [],
      areas_de_mejora:      analisis?.areas_de_mejora || [],
      palabras_clave:       analisis?.palabras_clave_sugeridas || [],
      titular_actual:       analisis?.titular_actual || null,
      titular_propuesto:    analisis?.titular_propuesto || null,
      resumen_actual:       analisis?.resumen_actual || null,
      resumen_propuesto:    analisis?.resumen_propuesto || null,
      recomendaciones:      analisis?.recomendaciones || [],
      estrategia_contenido: analisis?.estrategia_contenido || null,
      foto_analizada:       !!analisis?._fotoAnalizada,
      foto_recomendacion:   analisis?.foto_recomendacion || null,
      consentimiento:       consentimiento,
    })
    .select('id')
    .single()
  return { id: data?.id || null, error }
}

export async function saveCvGenerado({ analisisId, contacto, cv, conApoyoMercadoPago }) {
  const { error } = await supabase
    .from('cv_generados')
    .insert({
      analisis_id:       analisisId || null,
      nombre:            cv.nombre || null,
      email:             contacto.email,
      telefono:          contacto.telefono || null,
      linkedin_url:      contacto.linkedinUrl || null,
      cv_data:           cv,
      apoyo_mercadopago: !!conApoyoMercadoPago,
      consentimiento:    true,
    })
  return error
}
