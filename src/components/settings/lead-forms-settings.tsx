'use client';

// ============================================================
// LeadFormsSettings — Configurações → Formulários
//
// Cria o endereço público (POST /f/{token}) que os sites usam para
// enviar leads ao SohoM, mostra o trecho de código pronto para colar
// no site e lista os envios recentes (só preencheu / conversa iniciada
// / recusado). Admin+ cria, edita, regenera e revoga.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Code2, Copy, FileInput, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RequireRole } from '@/components/auth/require-role';
import { SettingsPanelHead } from './settings-panel-head';

interface LeadForm {
  id: string;
  name: string;
  token: string;
  pipeline_id: string;
  ref_prefix: string;
  last_number: number;
  allowed_domains: string[];
  captcha_enabled: boolean;
  revoked_at: string | null;
  created_at: string;
}

interface Pipeline {
  id: string;
  name: string;
}

interface Submission {
  id: string;
  form_id: string;
  status: 'accepted' | 'rejected';
  reject_reason: string | null;
  ref_code: string | null;
  origin_host: string | null;
  conversation_started_at: string | null;
  created_at: string;
}

function endpointFor(token: string): string {
  const base =
    typeof window !== 'undefined' ? window.location.origin : 'https://app.sohom.com.br';
  return `${base}/f/${token}`;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildSnippet(url: string, prefix: string): string {
  return `<script>
// Chame enviarLead({ nome, whatsapp, empresa }) quando a pessoa clicar em enviar.
async function enviarLead(dados) {
  // Abre o WhatsApp no clique e preenche o endereço depois (evita bloqueio de pop-up).
  var janela = window.open('', '_blank');
  var ref = '${prefix}'; // se o envio falhar, o WhatsApp abre mesmo assim
  try {
    var q = new URLSearchParams(location.search);
    var res = await fetch('${url}', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, dados, {
        utm_source: q.get('utm_source'), utm_medium: q.get('utm_medium'),
        utm_campaign: q.get('utm_campaign'), utm_content: q.get('utm_content'),
        utm_term: q.get('utm_term'), gclid: q.get('gclid'), fbclid: q.get('fbclid'),
        page_url: location.href, referrer: document.referrer,
        _hp: '' // campo isca: deixe vazio
      }))
    });
    var json = await res.json();
    if (json.ok && json.ref) ref = json.ref;
  } catch (e) {}
  var texto = encodeURIComponent('Olá! Quero começar.\\nRef: ' + ref);
  janela.location = 'https://wa.me/55DDDNUMERO?text=' + texto; // troque pelo número do WhatsApp da empresa
}
</script>`;
}

export function LeadFormsSettings() {
  const t = useTranslations('Settings.leadForms');

  const [forms, setForms] = useState<LeadForm[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [snippetFor, setSnippetFor] = useState<LeadForm | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/lead-forms', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('loadFailed'));
        return;
      }
      const data = await res.json();
      setForms(data.forms);
      setPipelines(data.pipelines);
      setSubmissions(data.submissions);
    } catch (err) {
      console.error('[LeadFormsSettings] load error:', err);
      toast.error(t('networkError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('copied'));
    } catch {
      toast.error(t('copyFailed'));
    }
  }

  async function act(form: LeadForm, kind: 'regenerate' | 'revoke') {
    const msg = kind === 'regenerate' ? t('confirmRegenerate') : t('confirmRevoke');
    if (!window.confirm(msg)) return;
    setBusy(form.id);
    try {
      const res =
        kind === 'regenerate'
          ? await fetch(`/api/account/lead-forms/${form.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ regenerate_token: true }),
            })
          : await fetch(`/api/account/lead-forms/${form.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || t('actionFailed'));
        return;
      }
      toast.success(kind === 'regenerate' ? t('regenerated') : t('revoked'));
      await load();
    } catch {
      toast.error(t('networkError'));
    } finally {
      setBusy(null);
    }
  }

  async function toggleCaptcha(form: LeadForm, enabled: boolean) {
    setForms((prev) => prev.map((f) => (f.id === form.id ? { ...f, captcha_enabled: enabled } : f)));
    const res = await fetch(`/api/account/lead-forms/${form.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ captcha_enabled: enabled }),
    });
    if (!res.ok) {
      toast.error(t('actionFailed'));
      void load();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  const formName = (id: string) => forms.find((f) => f.id === id)?.name ?? '—';
  const pipelineName = (id: string) => pipelines.find((p) => p.id === id)?.name ?? '—';

  return (
    <section className="animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title={t('title')}
        description={t('description')}
        action={
          <RequireRole min="admin">
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              {t('newForm')}
            </Button>
          </RequireRole>
        }
      />

      {forms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 text-center">
            <FileInput className="text-muted-foreground size-6" />
            <p className="text-muted-foreground mt-2 text-sm">{t('empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => {
            const revoked = !!f.revoked_at;
            const url = endpointFor(f.token);
            return (
              <Card key={f.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-sm font-medium">{f.name}</span>
                    <Badge className="border-border bg-muted text-muted-foreground text-[10px]">
                      {f.ref_prefix}-0000
                    </Badge>
                    {revoked && (
                      <Badge className="border-border bg-muted text-muted-foreground text-[10px] uppercase">
                        {t('revokedBadge')}
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('funnel', { name: pipelineName(f.pipeline_id) })} · {t('leadsCount', { n: f.last_number })}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t('domains')}: {f.allowed_domains.join(', ')}
                  </p>
                  {!revoked && (
                    <div className="flex gap-2">
                      <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                      <Button type="button" variant="outline" onClick={() => copy(url)}>
                        <Copy className="size-4" />
                        {t('copy')}
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {!revoked && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setSnippetFor(f)}>
                        <Code2 className="size-4" />
                        {t('siteCode')}
                      </Button>
                    )}
                    <RequireRole min="admin">
                      <label className="text-muted-foreground flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={f.captcha_enabled}
                          onCheckedChange={(c) => toggleCaptcha(f, c === true)}
                        />
                        {t('captcha')}
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy === f.id}
                        onClick={() => act(f, 'regenerate')}
                      >
                        <RefreshCw className="size-4" />
                        {t('regenerate')}
                      </Button>
                      {!revoked && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={busy === f.id}
                          onClick={() => act(f, 'revoke')}
                          className="border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500/60 hover:bg-red-500/20 hover:text-red-200"
                        >
                          <Trash2 className="size-4" />
                          {t('revoke')}
                        </Button>
                      )}
                    </RequireRole>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div>
        <h3 className="text-foreground mb-2 text-sm font-semibold">{t('recent')}</h3>
        {submissions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noSubmissions')}</p>
        ) : (
          <Card>
            <CardContent className="p-0">
              <ul className="divide-border divide-y">
                {submissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                    <span className="text-foreground font-mono text-xs">{s.ref_code ?? '—'}</span>
                    <Badge className="border-border bg-muted text-muted-foreground text-[10px]">
                      {s.status === 'rejected'
                        ? `${t('rejected')}${s.reject_reason ? `: ${s.reject_reason}` : ''}`
                        : s.conversation_started_at
                          ? t('conversationStarted')
                          : t('onlyFilled')}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {formName(s.form_id)}
                      {s.origin_host ? ` · ${s.origin_host}` : ''}
                    </span>
                    <span className="text-muted-foreground ml-auto text-xs">{fmtDateTime(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <CreateFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        pipelines={pipelines}
        onCreated={load}
      />

      <Dialog open={!!snippetFor} onOpenChange={(o) => !o && setSnippetFor(null)}>
        <DialogContent className="border-border bg-popover sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('siteCode')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">{t('siteCodeDesc')}</DialogDescription>
          </DialogHeader>
          {snippetFor && (
            <Textarea
              readOnly
              rows={16}
              className="font-mono text-xs"
              value={buildSnippet(endpointFor(snippetFor.token), snippetFor.ref_prefix)}
              onFocus={(e) => e.currentTarget.select()}
            />
          )}
          <DialogFooter>
            {snippetFor && (
              <Button
                variant="outline"
                onClick={() => copy(buildSnippet(endpointFor(snippetFor.token), snippetFor.ref_prefix))}
              >
                <Copy className="size-4" />
                {t('copy')}
              </Button>
            )}
            <Button onClick={() => setSnippetFor(null)}>{t('done')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CreateFormDialog({
  open,
  onOpenChange,
  pipelines,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelines: Pipeline[];
  onCreated: () => void;
}) {
  const t = useTranslations('Settings.leadForms');
  const [name, setName] = useState('');
  const [prefix, setPrefix] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [domains, setDomains] = useState('');
  const [captcha, setCaptcha] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && !pipelineId && pipelines[0]) setPipelineId(pipelines[0].id);
  }, [open, pipelineId, pipelines]);

  function reset() {
    setName('');
    setPrefix('');
    setDomains('');
    setCaptcha(false);
    setPipelineId('');
  }

  async function handleCreate() {
    if (!name.trim() || !prefix.trim() || !domains.trim() || !pipelineId) {
      toast.error(t('fillAll'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/lead-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          ref_prefix: prefix,
          pipeline_id: pipelineId,
          allowed_domains: domains,
          captcha_enabled: captcha,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || t('createFailed'));
        return;
      }
      toast.success(t('created'));
      reset();
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error(t('networkError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-popover-foreground">{t('newForm')}</DialogTitle>
          <DialogDescription className="text-muted-foreground">{t('newFormDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lf-name" className="text-muted-foreground">{t('nameLabel')}</Label>
            <Input id="lf-name" value={name} maxLength={100} placeholder={t('namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-pipeline" className="text-muted-foreground">{t('pipelineLabel')}</Label>
            <select
              id="lf-pipeline"
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">{t('pipelineHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-prefix" className="text-muted-foreground">{t('prefixLabel')}</Label>
            <Input
              id="lf-prefix"
              value={prefix}
              maxLength={12}
              placeholder="SM26"
              className="font-mono uppercase"
              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            />
            <p className="text-muted-foreground text-xs">{t('prefixHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lf-domains" className="text-muted-foreground">{t('domainsLabel')}</Label>
            <Textarea id="lf-domains" rows={3} value={domains} placeholder={'sohom.com.br'} onChange={(e) => setDomains(e.target.value)} />
            <p className="text-muted-foreground text-xs">{t('domainsHint')}</p>
          </div>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox checked={captcha} onCheckedChange={(c) => setCaptcha(c === true)} />
            {t('captchaLabel')}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>{t('cancel')}</Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
