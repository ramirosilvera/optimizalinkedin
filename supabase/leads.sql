-- ============================================================
-- LinkedIn Profile Optimizer — tabla de leads
-- Script idempotente: se puede ejecutar varias veces sin error.
-- ============================================================

-- 1. Crear tabla si no existe
CREATE TABLE IF NOT EXISTS leads (
  id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at            timestamptz NOT NULL DEFAULT now(),
  nombre                text,
  apellido              text,
  qa_history            jsonb,
  resultado_analisis    jsonb,
  respuestas_entrevista jsonb,
  feedback_entrevista   jsonb
);

-- 2. Agregar columnas si faltan (seguro correr aunque ya existan)
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS nombre                text,
  ADD COLUMN IF NOT EXISTS apellido              text,
  ADD COLUMN IF NOT EXISTS qa_history            jsonb,
  ADD COLUMN IF NOT EXISTS resultado_analisis    jsonb,
  ADD COLUMN IF NOT EXISTS respuestas_entrevista jsonb,
  ADD COLUMN IF NOT EXISTS feedback_entrevista   jsonb;

-- 3. Índice para ordenar por fecha
CREATE INDEX IF NOT EXISTS leads_created ON leads (created_at DESC);

-- 4. Row Level Security
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- 5. Política de inserción (DROP IF EXISTS para poder re-ejecutar)
DROP POLICY IF EXISTS "insertar_leads" ON leads;
CREATE POLICY "insertar_leads" ON leads
  FOR INSERT WITH CHECK (true);

-- ============================================================
-- Qué recibe cada columna desde la app:
--
--   nombre                → nombre ingresado en el modal "Conectar con Ramiro"
--   apellido              → apellido ingresado en el modal
--   qa_history            → array con las respuestas del cuestionario previo al análisis
--                           [{ question, answer }, ...]
--   resultado_analisis    → objeto JSON con el análisis completo de LinkedIn
--                           (puntaje_general, titular_propuesto, fortalezas,
--                            recomendaciones, seo, etc.)
--   respuestas_entrevista → array con las respuestas de la entrevista STAR
--                           [{ pregunta, respuesta }, ...]
--   feedback_entrevista   → objeto JSON con el feedback de IA a la entrevista
--                           (puntaje_general, fortalezas, feedback_por_respuesta, etc.)
--
-- Nota: qa_history y resultado_analisis se guardan siempre.
-- respuestas_entrevista y feedback_entrevista pueden estar vacíos ([]/{}})
-- si el usuario conecta antes de completar la entrevista.
-- ============================================================
