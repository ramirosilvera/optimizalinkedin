-- ── Career Tracking: columnas de kanban y postulaciones ─────────────────────

-- Columnas personalizables del kanban
CREATE TABLE IF NOT EXISTS kanban_columnas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre     text NOT NULL CHECK (char_length(nombre) BETWEEN 1 AND 50),
  orden      integer NOT NULL DEFAULT 0,
  color      text NOT NULL DEFAULT '#64748b',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kanban_columnas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario gestiona sus columnas"
  ON kanban_columnas FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS kanban_columnas_user ON kanban_columnas (user_id, orden);

-- Postulaciones laborales
CREATE TABLE IF NOT EXISTS postulaciones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  columna_id        uuid REFERENCES kanban_columnas(id) ON DELETE SET NULL,
  empresa           text NOT NULL CHECK (char_length(empresa) BETWEEN 1 AND 100),
  puesto            text NOT NULL CHECK (char_length(puesto) BETWEEN 1 AND 100),
  link_aviso        text,
  fecha_aplicacion  date NOT NULL DEFAULT CURRENT_DATE,
  notas             text,
  cv_data           jsonb,
  orden             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE postulaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario gestiona sus postulaciones"
  ON postulaciones FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS postulaciones_columna ON postulaciones (columna_id, orden);
CREATE INDEX IF NOT EXISTS postulaciones_user ON postulaciones (user_id, created_at DESC);
