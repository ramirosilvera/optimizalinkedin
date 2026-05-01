-- LinkedIn Profile Optimizer — tabla de análisis de perfil
-- Pegá este SQL en el SQL Editor de tu proyecto de Supabase y ejecutalo.

CREATE TABLE IF NOT EXISTS analisis (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  qa_history         jsonb       NOT NULL DEFAULT '[]',
  resultado_analisis jsonb       NOT NULL DEFAULT '{}',
  puntaje_general    int,
  consentimiento     boolean     NOT NULL DEFAULT true
);

-- Índice para filtrar y ordenar por puntaje fácilmente
CREATE INDEX IF NOT EXISTS analisis_puntaje ON analisis (puntaje_general, created_at DESC);

-- Row Level Security: la clave anónima solo puede insertar.
-- Los datos son write-only desde el frontend.
ALTER TABLE analisis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insertar_analisis" ON analisis
  FOR INSERT WITH CHECK (true);

-- Para leer los datos:
-- Table Editor → analisis → hacé clic en una fila para ver:
--   qa_history         → las respuestas del cuestionario previo al análisis
--   resultado_analisis → análisis completo (puntaje, titular, resumen, fortalezas, recomendaciones, etc.)
--   puntaje_general    → extraído para poder filtrar/ordenar sin abrir el JSON
--   consentimiento     → siempre true (el usuario autorizó explícitamente el guardado)
