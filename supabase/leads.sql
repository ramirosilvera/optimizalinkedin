-- LinkedIn Profile Optimizer — tabla de leads (contactos con Ramiro)
-- Pegá este SQL en el SQL Editor de tu proyecto de Supabase y ejecutalo.

CREATE TABLE IF NOT EXISTS leads (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            timestamptz NOT NULL DEFAULT now(),
  nombre                text,
  apellido              text,
  qa_history            jsonb       NOT NULL DEFAULT '[]',
  resultado_analisis    jsonb       NOT NULL DEFAULT '{}',
  respuestas_entrevista jsonb       NOT NULL DEFAULT '[]',
  feedback_entrevista   jsonb       NOT NULL DEFAULT '{}'
);

-- Si la tabla ya existe, agregá las columnas faltantes con este comando:
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS nombre   text,
  ADD COLUMN IF NOT EXISTS apellido text;

-- Row Level Security: la clave anónima (pública) solo puede insertar.
-- No hay política SELECT → los datos son write-only desde el frontend.
-- Solo vos podés leerlos desde el dashboard de Supabase (con la service key).
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insertar_leads" ON leads
  FOR INSERT WITH CHECK (true);

-- Para leer los datos:
-- Table Editor → leads → hacé clic en una fila para ver las columnas JSON:
--   nombre                → nombre del usuario
--   apellido              → apellido del usuario
--   qa_history            → las 11 respuestas del cuestionario
--   resultado_analisis    → análisis completo (puntaje, fortalezas, titular, recomendaciones, etc.)
--   respuestas_entrevista → las 5 respuestas de la entrevista
--   feedback_entrevista   → feedback IA (puntaje, fortalezas, feedback por respuesta)
