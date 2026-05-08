-- ── Premium: perfiles, historial, suscripciones ──────────────────────────

-- Tabla de perfiles de usuario (extiende auth.users)
CREATE TABLE IF NOT EXISTS perfiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre        text,
  email         text,
  es_premium    boolean NOT NULL DEFAULT false,
  premium_hasta timestamptz,
  mp_subscription_id text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve y edita su propio perfil"
  ON perfiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Historial de análisis, CVs, entrevistas y STAR
CREATE TABLE IF NOT EXISTS historial (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo       text NOT NULL CHECK (tipo IN ('analisis','cv','entrevista','star')),
  titulo     text,
  datos      jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve y crea su propio historial"
  ON historial FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Suscripciones de Mercado Pago
CREATE TABLE IF NOT EXISTS suscripciones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mp_subscription_id text UNIQUE,
  status             text,
  next_payment_date  timestamptz,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE suscripciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuario ve su propia suscripción"
  ON suscripciones FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT/UPDATE solo por service role (webhook de MP)
