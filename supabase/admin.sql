-- ── Admin Panel: roles, promo codes, audit log ──────────────────────────────

-- Roles de administrador
CREATE TABLE IF NOT EXISTS admin_roles (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text NOT NULL DEFAULT 'admin'
             CHECK (role IN ('super_admin','admin','support','read_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);
ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
-- Solo service role puede leer/escribir (nunca la anon key)
CREATE POLICY "service_only_admin_roles" ON admin_roles FOR ALL USING (false);

-- Códigos promocionales
CREATE TABLE IF NOT EXISTS promo_codes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,
  description   text,
  duration_days int NOT NULL DEFAULT 30,
  max_uses      int,           -- null = ilimitado
  uses_count    int NOT NULL DEFAULT 0,
  expires_at    timestamptz,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  is_active     boolean NOT NULL DEFAULT true
);
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_promo_codes" ON promo_codes FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS promo_codes_code ON promo_codes (code);
CREATE INDEX IF NOT EXISTS promo_codes_active ON promo_codes (is_active, created_at DESC);

-- Log de auditoría de acciones admin
CREATE TABLE IF NOT EXISTS admin_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid REFERENCES auth.users(id),
  action      text NOT NULL,
  target_type text,  -- 'user' | 'promo_code' | 'subscription'
  target_id   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_admin_logs" ON admin_logs FOR ALL USING (false);

CREATE INDEX IF NOT EXISTS admin_logs_created ON admin_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_logs_admin ON admin_logs (admin_id, created_at DESC);

-- ── Trigger: asignar super_admin automáticamente a ra1990@hotmail.com ────────
CREATE OR REPLACE FUNCTION public.auto_assign_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'ra1990@hotmail.com' THEN
    INSERT INTO public.admin_roles (user_id, role)
    VALUES (NEW.id, 'super_admin')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.auto_assign_admin_role();

-- ── Seed: asignar si la cuenta ya existe ─────────────────────────────────────
INSERT INTO admin_roles (user_id, role)
SELECT id, 'super_admin' FROM auth.users WHERE email = 'ra1990@hotmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- ── Código de bienvenida por defecto (30 días free) ──────────────────────────
INSERT INTO promo_codes (code, description, duration_days, max_uses, is_active)
VALUES ('OPTIMIZA30', 'Trial 30 días - código de lanzamiento', 30, 100, true)
ON CONFLICT (code) DO NOTHING;
