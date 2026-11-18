// ============================================================
// Liga a conversa do WhatsApp ao lead que veio de um formulário.
//
// - `Ref: SM26-0042` na mensagem liga a conversa ao lead certo, mesmo
//   que o número que escreveu seja diferente do digitado no formulário.
// - Na primeira mensagem, o negócio sai de "Formulário preenchido" e
//   vai para "Conversa iniciada".
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

import { findExistingContact } from '@/lib/contacts/dedupe';
import { brPhoneVariants } from '@/lib/leads/phone-br';

export interface RefLead {
  dealId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  contact: any;
}

/**
 * Resolve o lead de um código de referência. Se o número que escreveu
 * for diferente do contato, guarda esse número no contato (o número do
 * formulário vai para `form_phone`) para que as respostas cheguem ao
 * WhatsApp que realmente falou conosco. Devolve null se não achar o
 * lead, ou se o número que escreveu já pertence a outro contato (aí
 * vale a ligação normal por telefone).
 */
export async function resolveRefLead(
  db: SupabaseClient,
  accountId: string,
  refCode: string,
  senderPhone: string
): Promise<RefLead | null> {
  const { data: deal } = await db
    .from('deals')
    .select('id, contact_id')
    .eq('account_id', accountId)
    .ilike('ref_code', refCode)
    .limit(1)
    .maybeSingle();
  if (!deal) return null;

  const { data: contact } = await db
    .from('contacts')
    .select('*')
    .eq('id', deal.contact_id as string)
    .eq('account_id', accountId)
    .maybeSingle();
  if (!contact) return null;

  const sameNumber = brPhoneVariants(senderPhone).some((v) =>
    brPhoneVariants(contact.phone as string).includes(v)
  );
  if (sameNumber) return { dealId: deal.id as string, contact };

  // Número diferente do formulário.
  const other = await findExistingContact(db, accountId, senderPhone);
  if (other && other.id !== contact.id) return null;

  const { data: updated, error } = await db
    .from('contacts')
    .update({
      phone: senderPhone,
      form_phone: contact.form_phone ?? contact.phone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contact.id as string)
    .select('*')
    .single();
  if (error || !updated) {
    console.error('[lead-form] failed to store WhatsApp number:', error);
    return { dealId: deal.id as string, contact };
  }
  return { dealId: deal.id as string, contact: updated };
}

/**
 * Move para "Conversa iniciada" os negócios de formulário do contato
 * que ainda estão em "Formulário preenchido". Com `dealId`, só aquele.
 * Nunca lança: falhas aqui não podem derrubar o processamento da
 * mensagem.
 */
export async function advanceFormDeals(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  opts: { dealId?: string; conversationId?: string } = {}
): Promise<void> {
  try {
    let q = db
      .from('deals')
      .select('id, stage_id, form_id, conversation_id')
      .eq('account_id', accountId)
      .eq('contact_id', contactId)
      .not('form_id', 'is', null);
    if (opts.dealId) q = q.eq('id', opts.dealId);
    const { data: deals } = await q;
    if (!deals || deals.length === 0) return;

    const formIds = [...new Set(deals.map((d) => d.form_id as string))];
    const { data: forms } = await db
      .from('lead_forms')
      .select('id, stage_id, conversation_stage_id')
      .in('id', formIds);
    const byId = new Map(
      (forms ?? []).map((f) => [f.id as string, f] as const)
    );

    const now = new Date().toISOString();
    for (const deal of deals) {
      const form = byId.get(deal.form_id as string);
      if (!form || deal.stage_id !== form.stage_id) continue;

      const patch: Record<string, unknown> = {
        stage_id: form.conversation_stage_id,
        updated_at: now,
      };
      if (!deal.conversation_id && opts.conversationId) {
        patch.conversation_id = opts.conversationId;
      }
      const { error } = await db
        .from('deals')
        .update(patch)
        .eq('id', deal.id as string)
        .eq('stage_id', form.stage_id); // não sobrescreve movimento manual
      if (error) {
        console.error('[lead-form] advance deal error:', error);
        continue;
      }
      await db
        .from('lead_form_submissions')
        .update({ conversation_started_at: now })
        .eq('deal_id', deal.id as string)
        .is('conversation_started_at', null);
    }
  } catch (err) {
    console.error('[lead-form] advanceFormDeals failed:', err);
  }
}
