// ============================================================
// Criação de lead a partir de um formulário de site (POST /f/{token}).
//
// Contato: reaproveita o existente (mesmo telefone, com ou sem o 9º
// dígito) e preenche só o que estiver vazio; senão cria.
// Negócio: etapa inicial do formulário, com origem (UTMs) e código de
// referência. Se o contato já tem um negócio deste formulário ainda na
// etapa inicial (reenvio), reaproveita — e devolve o mesmo código.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import { isUniqueViolation } from '@/lib/contacts/dedupe';
import { brPhoneVariants } from '@/lib/leads/phone-br';
import { formatRefCode } from '@/lib/leads/ref-code';

export interface LeadFormRow {
  id: string;
  account_id: string;
  name: string;
  pipeline_id: string;
  stage_id: string;
  conversation_stage_id: string;
  ref_prefix: string;
}

export interface FormLeadInput {
  name: string;
  /** Telefone já normalizado (55 + DDD + número). */
  phone: string;
  company?: string;
  email?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  page_url?: string;
  referrer?: string;
}

export interface FormLeadResult {
  ref: string;
  contactId: string;
  dealId: string;
  contactCreated: boolean;
  dealReused: boolean;
}

async function findContactByPhone(
  db: SupabaseClient,
  accountId: string,
  phone: string
): Promise<Record<string, unknown> | null> {
  const variants = brPhoneVariants(phone);
  if (variants.length === 0) return null;
  const { data } = await db
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .in('phone_normalized', variants)
    .order('created_at', { ascending: true })
    .limit(1);
  return (data?.[0] as Record<string, unknown> | undefined) ?? null;
}

export async function createFormLead(
  db: SupabaseClient,
  form: LeadFormRow,
  input: FormLeadInput
): Promise<FormLeadResult> {
  const accountId = form.account_id;
  const auditUserId = await resolveAuditUserId(db, accountId);

  // ---- Contato -------------------------------------------------
  let contact = await findContactByPhone(db, accountId, input.phone);
  let contactCreated = false;

  if (contact) {
    const patch: Record<string, unknown> = {};
    const currentName = (contact.name as string | null) ?? '';
    if (!currentName || currentName === contact.phone) patch.name = input.name;
    if (!contact.email && input.email) patch.email = input.email;
    if (!contact.company && input.company) patch.company = input.company;
    if (!contact.source) patch.source = form.name;
    if (Object.keys(patch).length > 0) {
      await db
        .from('contacts')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', contact.id as string);
    }
  } else {
    const { data: created, error } = await db
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: auditUserId,
        phone: input.phone,
        name: input.name,
        email: input.email ?? null,
        company: input.company ?? null,
        source: form.name,
      })
      .select('*')
      .single();
    if (error || !created) {
      if (isUniqueViolation(error)) {
        contact = await findContactByPhone(db, accountId, input.phone);
      }
      if (!contact) {
        console.error('[lead-form] contact insert error:', error);
        throw new Error('contact_create_failed');
      }
    } else {
      contact = created as Record<string, unknown>;
      contactCreated = true;
    }
  }
  const contactId = contact.id as string;

  // ---- Negócio -------------------------------------------------
  const origin = {
    source: form.name,
    channel: 'formulario',
    utm_source: input.utm_source ?? null,
    utm_medium: input.utm_medium ?? null,
    utm_campaign: input.utm_campaign ?? null,
    utm_content: input.utm_content ?? null,
    utm_term: input.utm_term ?? null,
    gclid: input.gclid ?? null,
    fbclid: input.fbclid ?? null,
    landing_page: input.page_url ?? null,
    referrer: input.referrer ?? null,
  };

  // Reenvio: já existe negócio deste formulário ainda sem conversa.
  const { data: open } = await db
    .from('deals')
    .select('id, ref_code')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .eq('form_id', form.id)
    .eq('stage_id', form.stage_id)
    .not('ref_code', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (open?.ref_code) {
    return {
      ref: open.ref_code as string,
      contactId,
      dealId: open.id as string,
      contactCreated,
      dealReused: true,
    };
  }

  const { data: acct } = await db
    .from('accounts')
    .select('owner_user_id, default_currency')
    .eq('id', accountId)
    .maybeSingle();
  const { data: ownerProfile } = acct?.owner_user_id
    ? await db
        .from('profiles')
        .select('id')
        .eq('user_id', acct.owner_user_id)
        .eq('account_id', accountId)
        .maybeSingle()
    : { data: null };

  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: n, error: numErr } = await db.rpc('next_lead_form_number', {
      p_form_id: form.id,
    });
    if (numErr || typeof n !== 'number') {
      console.error('[lead-form] ref number error:', numErr);
      throw new Error('ref_number_failed');
    }
    const ref = formatRefCode(form.ref_prefix, n);

    const { data: deal, error: dealErr } = await db
      .from('deals')
      .insert({
        account_id: accountId,
        user_id: auditUserId,
        assigned_to: ownerProfile?.id ?? null,
        currency: acct?.default_currency ?? undefined,
        pipeline_id: form.pipeline_id,
        stage_id: form.stage_id,
        contact_id: contactId,
        title: `Lead - ${input.name}`,
        ref_code: ref,
        form_id: form.id,
        ...origin,
      })
      .select('id')
      .single();

    if (!dealErr && deal) {
      return {
        ref,
        contactId,
        dealId: deal.id as string,
        contactCreated,
        dealReused: false,
      };
    }
    if (!isUniqueViolation(dealErr)) {
      console.error('[lead-form] deal insert error:', dealErr);
      throw new Error('deal_create_failed');
    }
  }
  throw new Error('deal_create_failed');
}
