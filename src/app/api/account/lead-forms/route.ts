// ============================================================
// /api/account/lead-forms — formulários que enviam leads ao SohoM
//
//   GET  — formulários da conta, funis e envios recentes (qualquer membro)
//   POST — cria formulário (admin+)
//
// O endereço público do formulário é POST /f/{token} (src/app/f).
// ============================================================

import { NextResponse } from 'next/server';

import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account';
import { newFormToken, parseDomains } from '@/lib/leads/form-config';
import { ensureFormStages } from '@/lib/leads/form-stages';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit';

const FORM_COLUMNS =
  'id, name, token, pipeline_id, stage_id, conversation_stage_id, ref_prefix, last_number, allowed_domains, captcha_enabled, revoked_at, created_at';

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const [forms, pipelines, submissions] = await Promise.all([
      ctx.supabase
        .from('lead_forms')
        .select(FORM_COLUMNS)
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false }),
      ctx.supabase
        .from('pipelines')
        .select('id, name')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: true }),
      ctx.supabase
        .from('lead_form_submissions')
        .select(
          'id, form_id, status, reject_reason, ref_code, origin_host, conversation_started_at, created_at'
        )
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(30),
    ]);

    if (forms.error || pipelines.error || submissions.error) {
      console.error('[GET /api/account/lead-forms]', forms.error, pipelines.error, submissions.error);
      return NextResponse.json({ error: 'Failed to load forms' }, { status: 500 });
    }

    return NextResponse.json({
      forms: forms.data,
      pipelines: pipelines.data,
      submissions: submissions.data,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(`admin:leadForm:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : '';
    const prefix = typeof body.ref_prefix === 'string' ? body.ref_prefix.trim().toUpperCase() : '';
    const pipelineId = typeof body.pipeline_id === 'string' ? body.pipeline_id : '';
    const domains = parseDomains(body.allowed_domains);

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!/^[A-Z0-9]{2,12}$/.test(prefix)) {
      return NextResponse.json(
        { error: 'Prefix must have 2 to 12 letters or numbers' },
        { status: 400 }
      );
    }
    if (domains.length === 0) {
      return NextResponse.json(
        { error: 'Add at least one authorized domain' },
        { status: 400 }
      );
    }

    const { data: pipeline } = await ctx.supabase
      .from('pipelines')
      .select('id')
      .eq('id', pipelineId)
      .eq('account_id', ctx.accountId)
      .maybeSingle();
    if (!pipeline) return NextResponse.json({ error: 'Pipeline not found' }, { status: 400 });

    const { stageId, conversationStageId } = await ensureFormStages(ctx.supabase, pipeline.id);

    const { data, error } = await ctx.supabase
      .from('lead_forms')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        name,
        token: newFormToken(),
        pipeline_id: pipeline.id,
        stage_id: stageId,
        conversation_stage_id: conversationStageId,
        ref_prefix: prefix,
        allowed_domains: domains,
        captcha_enabled: body.captcha_enabled === true,
      })
      .select(FORM_COLUMNS)
      .single();

    if (error || !data) {
      if ((error as { code?: string } | null)?.code === '23505') {
        return NextResponse.json({ error: 'This prefix is already in use' }, { status: 409 });
      }
      console.error('[POST /api/account/lead-forms]', error);
      return NextResponse.json({ error: 'Failed to create form' }, { status: 500 });
    }
    return NextResponse.json({ form: data }, { status: 201 });
  } catch (err) {
    return toErrorResponse(err);
  }
}
