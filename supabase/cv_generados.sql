-- LinkedIn Profile Optimizer — tabla de CVs generados
-- Pegá este SQL en el SQL Editor de tu proyecto de Supabase y ejecutalo.

CREATE TABLE IF NOT EXISTS cv_generados (
  id                 uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  nombre             text,
  email              text        NOT NULL,
  telefono           text,
  linkedin_url       text,
  cv_data            jsonb       NOT NULL DEFAULT '{}',
  apoyo_mercadopago  boolean     NOT NULL DEFAULT false,
  consentimiento     boolean     NOT NULL DEFAULT true
);

-- Índice para consultar fácilmente quiénes apoyaron con $5.000
CREATE INDEX IF NOT EXISTS cv_generados_apoyo ON cv_generados (apoyo_mercadopago, created_at DESC);

-- Row Level Security: la clave anónima solo puede insertar.
-- Los datos son write-only desde el frontend.
ALTER TABLE cv_generados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insertar_cv_generados" ON cv_generados
  FOR INSERT WITH CHECK (true);

-- Para leer los datos:
-- Table Editor → cv_generados → hacé clic en una fila para ver:
--   nombre, email, telefono, linkedin_url  → datos de contacto del usuario
--   cv_data                                → CV completo generado (JSON con todas las secciones)
--   apoyo_mercadopago                      → true si el usuario optó por apoyar $5.000
--   consentimiento                         → siempre true (el usuario aceptó los términos al generar)
