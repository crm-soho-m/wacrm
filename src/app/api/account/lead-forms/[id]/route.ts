// PATCH  /api/account/lead-forms/[id] — edita (domínios, captcha, nome),
//        regenera o token ({ regenerate_token: true }) ou reativa.
// DELETE /api/account/lead-forms/[id] — revoga o token (o endereço para
//        de aceitar envios; histórico e leads ficam).
// Admin+.

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import { newFormToken, parseDomains } from '@/lib/leads/form-config';

type Params = { params: Promise<{ id: string }> };

const FORM_COLUMNS =
  'id, name, token, pipeline_id, stage_id, conversation_stage_id, ref_prefix, last_number, allowed_domains, captcha_enabled, revoked_at, created_at';

export async function PATCH(request: Request, { params }: Params) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`admin:leadForm:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (typeof body.name === 'string' && body.name.trim()) {
      patch.name = body.name.trim().slice(0, 100);
    }
    if (body.allowed_domains !== undefined) {
      const domains = parseDomains(body.allowed_domains);
      if (domains.length === 0) {
        return NextResponse.json({ error: 'Add at least one authorized domain' }, { status: 400 });
      }
      patch.allowed_domains = domains;
    }
    if (typeof body.captcha_enabled === 'boolean') patch.captcha_enabled = body.captcha_enabled;
    if (body.regenerate_token === true) {
      patch.token = newFormToken();
      patch.revoked_at = null;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data, error } = await ctx.supabase
      .from('lead_forms')
      .update(patch)
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select(FORM_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error('[PATCH /api/account/lead-forms/[id]]', error);
      return NextResponse.json({ error: 'Failed to update form' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    return NextResponse.json({ form: data });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const ctx = await requireRole('admin');
    const limit = checkRateLimit(`admin:leadForm:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;
    const { data, error } = await ctx.supabase
      .from('lead_forms')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('[DELETE /api/account/lead-forms/[id]]', error);
      return NextResponse.json({ error: 'Failed to revoke form' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
