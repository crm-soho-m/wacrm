-- ============================================================
-- 046_lead_forms.sql — Webhook de formulário (entrada de leads)
--
-- Permite que qualquer formulário de site envie leads ao SohoM por um
-- endereço público (POST /f/{token}) que SÓ cria leads. Cada envio
-- recebe um código de referência (ex.: SM26-0042) que liga a conversa
-- do WhatsApp ao lead certo.
--
-- Idempotente — pode ser executada mais de uma vez.
-- ============================================================

-- 1) Formulários (um token por formulário, ligado a uma conta)
CREATE TABLE IF NOT EXISTS public.lead_forms (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name                  text NOT NULL,
  token                 text NOT NULL UNIQUE,
  pipeline_id           uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  -- Etapa inicial ("Formulário preenchido") e etapa após a primeira
  -- mensagem no WhatsApp ("Conversa iniciada").
  stage_id              uuid NOT NULL REFERENCES public.pipeline_stages(id),
  conversation_stage_id uuid NOT NULL REFERENCES public.pipeline_stages(id),
  ref_prefix            text NOT NULL,
  last_number           integer NOT NULL DEFAULT 0,
  allowed_domains       text[] NOT NULL DEFAULT '{}',
  captcha_enabled       boolean NOT NULL DEFAULT false,
  revoked_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_forms_prefix_format CHECK (ref_prefix ~ '^[A-Za-z0-9]{2,12}$')
);

CREATE INDEX IF NOT EXISTS lead_forms_account_idx ON public.lead_forms (account_id);
-- O prefixo identifica o formulário dentro da conta.
CREATE UNIQUE INDEX IF NOT EXISTS lead_forms_account_prefix_idx
  ON public.lead_forms (account_id, upper(ref_prefix));

ALTER TABLE public.lead_forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_forms_select ON public.lead_forms;
CREATE POLICY lead_forms_select ON public.lead_forms FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS lead_forms_insert ON public.lead_forms;
CREATE POLICY lead_forms_insert ON public.lead_forms FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lead_forms_update ON public.lead_forms;
CREATE POLICY lead_forms_update ON public.lead_forms FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS lead_forms_delete ON public.lead_forms;
CREATE POLICY lead_forms_delete ON public.lead_forms FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- 2) Campos novos em contatos e negócios
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS form_phone text;  -- número digitado no formulário, quando difere do WhatsApp

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS ref_code text,
  ADD COLUMN IF NOT EXISTS form_id uuid REFERENCES public.lead_forms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referrer text;

-- Código de referência único por conta (comparação sem maiúsculas).
CREATE UNIQUE INDEX IF NOT EXISTS deals_account_ref_code_idx
  ON public.deals (account_id, upper(ref_code))
  WHERE ref_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_form_id_idx ON public.deals (form_id)
  WHERE form_id IS NOT NULL;

-- 3) Envios (aceitos e recusados) — diagnóstico e lista de envios recentes
CREATE TABLE IF NOT EXISTS public.lead_form_submissions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id              uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  form_id                 uuid NOT NULL REFERENCES public.lead_forms(id) ON DELETE CASCADE,
  status                  text NOT NULL CHECK (status IN ('accepted', 'rejected')),
  reject_reason           text,
  ref_code                text,
  contact_id              uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id                 uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  origin_host             text,
  conversation_started_at timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_form_submissions_form_idx
  ON public.lead_form_submissions (form_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_form_submissions_deal_idx
  ON public.lead_form_submissions (deal_id) WHERE deal_id IS NOT NULL;

ALTER TABLE public.lead_form_submissions ENABLE ROW LEVEL SECURITY;

-- Só leitura para membros; a escrita é feita pelo servidor (service role).
DROP POLICY IF EXISTS lead_form_submissions_select ON public.lead_form_submissions;
CREATE POLICY lead_form_submissions_select ON public.lead_form_submissions FOR SELECT
  USING (is_account_member(account_id));

-- 4) Número sequencial atômico por formulário
CREATE OR REPLACE FUNCTION public.next_lead_form_number(p_form_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.lead_forms
     SET last_number = last_number + 1
   WHERE id = p_form_id
  RETURNING last_number;
$$;

REVOKE ALL ON FUNCTION public.next_lead_form_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_lead_form_number(uuid) TO service_role;
