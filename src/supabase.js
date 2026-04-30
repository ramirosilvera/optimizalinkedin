import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function saveCvLead({ contacto, cv, analisis }) {
  const { error } = await supabase.from('cv_leads').insert({
    nombre:        cv.nombre   || null,
    email:         contacto.email,
    telefono:      contacto.telefono  || null,
    linkedin_url:  contacto.linkedinUrl || null,
    titular:       cv.titular  || null,
    resumen:       cv.resumen  || null,
    habilidades:   cv.habilidades || [],
    experiencias:  cv.experiencias || [],
    educacion:     cv.educacion || [],
    idiomas:       cv.idiomas || [],
    puntaje_analisis: analisis?.puntaje_general ?? null,
    nivel_seo:        analisis?.nivel_seo ?? null,
    palabras_clave:   analisis?.palabras_clave_sugeridas ?? [],
  })
  return error
}
