// ============================================================
// POST /f/{token} — webhook público de formulário
//
// Um endereço por formulário que SÓ cria leads (contato + negócio),
// seguro para ficar no código de um site. Protegido por: domínios
// autorizados (Origin/Referer), limite de envios por IP e por token,
// honeypot (`_hp`), captcha opcional (Cloudflare Turnstile), limite de
// tamanho e token revogável. Envios recusados ficam registrados.
//
// Resposta de sucesso: { ok: true, ref: "SM26-0042" } — só o código.
// ============================================================

import { NextResponse } from 'next/server';

import { supabaseAdmin } from '@/lib/flows/admin-client';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createFormLead, type LeadFormRow } from '@/lib/leads/form-submit';
import { hostFromUrl, isOriginAllowed } from '@/lib/leads/form-origin';
import { normalizeBrPhone } from '@/lib/leads/phone-br';

export const dynamic = 'force-dynamic';

const MAX_BODY_CHARS = 20_000;
const IP_LIMIT = { limit: 5, windowMs: 60_000 };
const TOKEN_LIMIT = { limit: 120, windowMs: 60_000 };
const LOG_LIMIT = { limit: 20, windowMs: 60_000 };

type Params = { params: Promise<{ token: string }> };

interface FormRecord extends LeadFormRow {
  allowed_domains: string[];
  captcha_enabled: boolean;
}

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

function json(
  body: Record<string, unknown>,
  status: number,
  headers: Record<string, string> = {}
) {
  return NextResponse.json(body, { status, headers });
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().slice(0, max);
  return v.length > 0 ? v : undefined;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

async function loadForm(token: string): Promise<FormRecord | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const { data } = await supabaseAdmin()
    .from('lead_forms')
    .select(
      'id, account_id, name, pipeline_id, stage_id, conversation_stage_id, ref_prefix, allowed_domains, captcha_enabled'
    )
    .eq('token', token)
    .is('revoked_at', null)
    .maybeSingle();
  return (data as FormRecord | null) ?? null;
}

// Registro de envios recusados (diagnóstico). Limitado para que spam
// não encha a tabela.
async function logRejected(
  form: FormRecord,
  reason: string,
  originHost: string | null
) {
  if (!checkRateLimit(`lf-log:${form.id}`, LOG_LIMIT).success) return;
  const { error } = await supabaseAdmin().from('lead_form_submissions').insert({
    account_id: form.account_id,
    form_id: form.id,
    status: 'rejected',
    reject_reason: reason,
    origin_host: originHost,
  });
  if (error) console.error('[lead-form] log rejected error:', error);
}

async function verifyTurnstile(
  secret: string,
  response: string,
  ip: string
): Promise<boolean> {
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response, remoteip: ip }),
      }
    );
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

export async function OPTIONS(request: Request, { params }: Params) {
  const { token } = await params;
  const form = await loadForm(token);
  const origin = request.headers.get('origin');
  if (!form || !isOriginAllowed(form.allowed_domains, hostFromUrl(origin))) {
    return new NextResponse(null, { status: 403 });
  }
  return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
}

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const form = await loadForm(token);
  if (!form) return json({ ok: false, error: 'not_found' }, 404);

  const origin = request.headers.get('origin');
  const originHost =
    hostFromUrl(origin) ?? hostFromUrl(request.headers.get('referer'));

  // 1) Domínio autorizado
  if (!isOriginAllowed(form.allowed_domains, originHost)) {
    await logRejected(form, 'origin', originHost);
    return json({ ok: false, error: 'forbidden_origin' }, 403);
  }
  const cors = corsHeaders(origin ?? `https://${originHost}`);

  // Conta suspensa não recebe leads novos.
  const { data: acc } = await supabaseAdmin()
    .from('accounts')
    .select('status')
    .eq('id', form.account_id)
    .maybeSingle();
  if (acc?.status === 'suspended') {
    return json({ ok: false, error: 'unavailable' }, 403, cors);
  }

  // 2) Limite de envios (por IP e por token)
  const ip = clientIp(request);
  const ipRl = checkRateLimit(`lf-ip:${form.id}:${ip}`, IP_LIMIT);
  const tokenRl = checkRateLimit(`lf-token:${form.id}`, TOKEN_LIMIT);
  if (!ipRl.success || !tokenRl.success) {
    await logRejected(form, 'rate_limit', originHost);
    const res = rateLimitResponse(!ipRl.success ? ipRl : tokenRl);
    Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
    return res;
  }

  // 3) Corpo (JSON ou formulário), com limite de tamanho
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BODY_CHARS) {
    await logRejected(form, 'too_large', originHost);
    return json({ ok: false, error: 'payload_too_large' }, 413, cors);
  }
  const contentType = request.headers.get('content-type') ?? '';
  let body: Record<string, unknown> = {};
  try {
    if (contentType.includes('application/json')) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        body = parsed as Record<string, unknown>;
      }
    } else {
      body = Object.fromEntries(new URLSearchParams(raw));
    }
  } catch {
    return json({ ok: false, error: 'bad_request' }, 400, cors);
  }

  // 4) Honeypot: preenchido = robô. Descarta sem erro.
  if (typeof body._hp === 'string' && body._hp.trim() !== '') {
    await logRejected(form, 'honeypot', originHost);
    return json({ ok: true }, 200, cors);
  }

  // 5) Captcha opcional (Turnstile)
  if (form.captcha_enabled) {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    const answer =
      str(body['cf-turnstile-response'], 4096) ??
      str(body.turnstile_token, 4096);
    if (!secret) {
      console.error('[lead-form] captcha ligado mas TURNSTILE_SECRET_KEY ausente');
      return json({ ok: false, error: 'captcha_unavailable' }, 500, cors);
    }
    if (!answer || !(await verifyTurnstile(secret, answer, ip))) {
      await logRejected(form, 'captcha', originHost);
      return json({ ok: false, error: 'captcha_failed' }, 400, cors);
    }
  }

  // 6) Validação
  const name = str(body.nome ?? body.name, 200);
  const phoneRaw = str(body.whatsapp ?? body.phone, 40);
  if (!name || !phoneRaw) {
    await logRejected(form, 'missing_fields', originHost);
    return json({ ok: false, error: 'missing_fields' }, 400, cors);
  }
  const phone = normalizeBrPhone(phoneRaw);
  if (!phone) {
    await logRejected(form, 'invalid_phone', originHost);
    return json({ ok: false, error: 'invalid_phone' }, 400, cors);
  }
  const email = str(body.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await logRejected(form, 'invalid_email', originHost);
    return json({ ok: false, error: 'invalid_email' }, 400, cors);
  }

  // 7) Cria contato + negócio
  try {
    const db = supabaseAdmin();
    const result = await createFormLead(db, form, {
      name,
      phone,
      email,
      company: str(body.empresa ?? body.company, 200),
      utm_source: str(body.utm_source, 200),
      utm_medium: str(body.utm_medium, 200),
      utm_campaign: str(body.utm_campaign, 200),
      utm_content: str(body.utm_content, 200),
      utm_term: str(body.utm_term, 200),
      gclid: str(body.gclid, 500),
      fbclid: str(body.fbclid, 500),
      page_url: str(body.page_url, 500),
      referrer: str(body.referrer, 500),
    });

    await db.from('lead_form_submissions').insert({
      account_id: form.account_id,
      form_id: form.id,
      status: 'accepted',
      ref_code: result.ref,
      contact_id: result.contactId,
      deal_id: result.dealId,
      origin_host: originHost,
    });

    return json({ ok: true, ref: result.ref }, 200, cors);
  } catch (err) {
    console.error('[lead-form] submit error:', err);
    return json({ ok: false, error: 'internal' }, 500, cors);
  }
}
