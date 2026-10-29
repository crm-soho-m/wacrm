// ============================================================
// POST /api/v1/leads — receive an external lead (scope: contacts:write)
//
// Find-or-create the contact by phone, record where it came from,
// and open a deal in the account's oldest pipeline, first stage.
// A deal is created only when the contact has none yet, so a form
// submitted twice does not duplicate opportunities.
// ============================================================

import { requireApiKey } from '@/lib/auth/api-context';
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond';
import {
  findOrCreateContact,
  setContactTags,
  getContactById,
  resolveAuditUserId,
  ContactError,
} from '@/lib/api/v1/contacts';

// Trimmed string, capped, or undefined when empty / not a string.
function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().slice(0, max);
  return v.length > 0 ? v : undefined;
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'contacts:write');

    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Request body must be a JSON object', 400);
    }

    const phone = str(body.phone, 30);
    if (!phone) {
      return fail('bad_request', "'phone' is required", 400);
    }

    const name = str(body.name, 200);
    const source = str(body.source, 100);
    const origin = {
      source,
      channel: str(body.channel, 100),
      utm_source: str(body.utm_source, 200),
      utm_medium: str(body.utm_medium, 200),
      utm_campaign: str(body.utm_campaign, 200),
      landing_page: str(body.landing_page, 500),
      lead_message: str(body.message, 2000),
    };

    const auditUserId = await resolveAuditUserId(ctx.supabase, ctx.accountId);

    const { id: contactId, created } = await findOrCreateContact(
      ctx.supabase,
      ctx.accountId,
      auditUserId,
      {
        phone,
        name,
        email: str(body.email, 200),
        company: str(body.company, 200),
      }
    );

    if (created && source) {
      await ctx.supabase
        .from('contacts')
        .update({ source })
        .eq('id', contactId)
        .eq('account_id', ctx.accountId);
    }

    if (Array.isArray(body.tags)) {
      await setContactTags(
        ctx.supabase,
        ctx.accountId,
        auditUserId,
        contactId,
        body.tags.filter((t): t is string => typeof t === 'string')
      );
    }

    // Open a deal only if this contact has none yet.
    let deal: { id: string; pipeline_id: string; stage_id: string } | null =
      null;
    let dealSkipped: 'has_deal' | 'no_pipeline' | null = null;

    const { count: existingDeals } = await ctx.supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId)
      .eq('contact_id', contactId);

    if ((existingDeals ?? 0) > 0) {
      dealSkipped = 'has_deal';
    } else {
      const { data: pipeline } = await ctx.supabase
        .from('pipelines')
        .select('id')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: stage } = pipeline
        ? await ctx.supabase
            .from('pipeline_stages')
            .select('id')
            .eq('pipeline_id', pipeline.id)
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle()
        : { data: null };

      if (!pipeline || !stage) {
        dealSkipped = 'no_pipeline';
      } else {
        const { data: created_deal, error: dealErr } = await ctx.supabase
          .from('deals')
          .insert({
            account_id: ctx.accountId,
            user_id: auditUserId,
            pipeline_id: pipeline.id,
            stage_id: stage.id,
            contact_id: contactId,
            title: `Lead - ${name ?? phone}`,
            ...origin,
          })
          .select('id, pipeline_id, stage_id')
          .single();

        if (dealErr || !created_deal) {
          console.error('[api/v1/leads] deal insert error:', dealErr);
          return fail('internal', 'Failed to create the deal', 500);
        }
        deal = created_deal;
      }
    }

    const contact = await getContactById(ctx.supabase, ctx.accountId, contactId);
    return ok(
      { contact, deal, deal_skipped: dealSkipped, contact_created: created },
      created ? 201 : 200
    );
  } catch (err) {
    if (err instanceof ContactError) {
      return fail(
        err.status === 400 ? 'bad_request' : 'internal',
        err.message,
        err.status
      );
    }
    return toApiErrorResponse(err);
  }
}