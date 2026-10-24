-- 040_platform_admin.sql

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_status_check;
ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_status_check CHECK (status IN ('active', 'suspended'));

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_admins FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_account_status_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status
      OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at)
     AND current_user = 'authenticated'
  THEN
    RAISE EXCEPTION 'account status cannot be changed directly'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_account_status_column ON public.accounts;
CREATE TRIGGER enforce_account_status_column
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.enforce_account_status_column();

REVOKE EXECUTE ON FUNCTION public.enforce_account_status_column() FROM PUBLIC, anon, authenticated;