-- LinkedIn Profile Optimizer — tabla de comentarios
-- Pegá este SQL en el SQL Editor de tu proyecto de Supabase y ejecutalo.

CREATE TABLE IF NOT EXISTS comments (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre       text        NOT NULL CHECK (char_length(nombre) BETWEEN 2 AND 80),
  titulo       text        NOT NULL CHECK (char_length(titulo) BETWEEN 2 AND 100),
  linkedin_url text        NOT NULL CHECK (char_length(linkedin_url) <= 200),
  comentario   text        NOT NULL CHECK (char_length(comentario) BETWEEN 10 AND 300),
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Índice para listar los aprobados rápido
CREATE INDEX IF NOT EXISTS comments_status_created ON comments (status, created_at DESC);

-- Row Level Security: la clave anónima (pública) solo puede:
--   - leer comentarios aprobados
--   - insertar comentarios nuevos (quedan en pending)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leer_aprobados" ON comments
  FOR SELECT USING (status = 'approved');

CREATE POLICY "insertar_pendientes" ON comments
  FOR INSERT WITH CHECK (status = 'pending');

-- Los comentarios se aprueban desde el dashboard de Supabase:
-- Table Editor → comments → cambiá el campo status de 'pending' a 'approved'.
