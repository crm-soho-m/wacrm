import type { SupabaseClient } from '@supabase/supabase-js';

export const FORM_STAGE_NAME = 'Formulário preenchido';
export const CONVERSATION_STAGE_NAME = 'Conversa iniciada';

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Garante as duas etapas do funil de formulário no pipeline:
 * "Formulário preenchido" (só preencheu) e "Conversa iniciada" (preencheu
 * e mandou mensagem). As que faltarem entram no início do funil, nessa
 * ordem; as já existentes são reaproveitadas.
 */
export async function ensureFormStages(
  db: SupabaseClient,
  pipelineId: string
): Promise<{ stageId: string; conversationStageId: string }> {
  const { data, error } = await db
    .from('pipeline_stages')
    .select('id, name, position')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true });
  if (error) throw new Error('stages_read_failed');

  const stages = (data ?? []) as { id: string; name: string; position: number }[];
  let form = stages.find((s) => norm(s.name) === norm(FORM_STAGE_NAME));
  let conv = stages.find((s) => norm(s.name) === norm(CONVERSATION_STAGE_NAME));

  if (form && conv) return { stageId: form.id, conversationStageId: conv.id };

  // Cria o que falta (posição provisória) e depois reordena tudo.
  const toInsert: { pipeline_id: string; name: string; position: number; color: string }[] = [];
  if (!form) toInsert.push({ pipeline_id: pipelineId, name: FORM_STAGE_NAME, position: 0, color: '#999999' });
  if (!conv) toInsert.push({ pipeline_id: pipelineId, name: CONVERSATION_STAGE_NAME, position: 0, color: '#ff3d77' });
  const { data: inserted, error: insErr } = await db
    .from('pipeline_stages')
    .insert(toInsert)
    .select('id, name, position');
  if (insErr || !inserted) throw new Error('stages_create_failed');
  for (const s of inserted as { id: string; name: string; position: number }[]) {
    if (norm(s.name) === norm(FORM_STAGE_NAME)) form = s;
    else conv = s;
  }
  if (!form || !conv) throw new Error('stages_create_failed');

  // Ordem final: etapas novas no início (Formulário antes de Conversa),
  // seguidas das etapas antigas na ordem em que estavam.
  const formId = form.id;
  const convId = conv.id;
  const newOnes = [form, conv].filter((s) => !stages.some((o) => o.id === s.id));
  const keptOld = stages.filter((s) => s.id !== formId && s.id !== convId);
  const existingSpecial = [form, conv].filter((s) => stages.some((o) => o.id === s.id));
  const ordered = [...newOnes, ...existingSpecial, ...keptOld];

  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (s.position !== i) {
      await db.from('pipeline_stages').update({ position: i }).eq('id', s.id);
    }
  }
  return { stageId: formId, conversationStageId: convId };
}
