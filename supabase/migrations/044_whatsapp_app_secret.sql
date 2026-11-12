-- Chave secreta (App Secret) do app da Meta de cada cliente, criptografada.
-- Usada para conferir a assinatura dos webhooks. Quando vazia, vale a
-- chave global META_APP_SECRET do servidor.
ALTER TABLE public.whatsapp_config ADD COLUMN IF NOT EXISTS app_secret TEXT;
