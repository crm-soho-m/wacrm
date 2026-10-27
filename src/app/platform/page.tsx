'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type PlatformAccount = {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  suspended_at: string | null;
  created_at: string;
  owner_email: string | null;
  member_count: number;
};

export default function PlatformAdminPage() {
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [setupLink, setSetupLink] = useState<string | null>(null);
  const [createdName, setCreatedName] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/platform/accounts');
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? 'Erro ao carregar empresas');
        setAccounts([]);
      } else {
        setAccounts(body.accounts ?? []);
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function changeStatus(a: PlatformAccount) {
    const next = a.status === 'active' ? 'suspended' : 'active';
    const verb = next === 'suspended' ? 'suspender' : 'reativar';
    if (!window.confirm(`Deseja ${verb} a empresa "${a.name}"?`)) return;

    setBusyId(a.id);
    try {
      const res = await fetch(`/api/platform/accounts/${a.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        window.alert(body?.error ?? 'Não foi possível alterar o status');
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    setSetupLink(null);
    setCopied(false);
    try {
      const res = await fetch('/api/platform/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, ownerEmail, ownerName }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(body?.error ?? 'Não foi possível criar a empresa');
        return;
      }
      setCreatedName(body.account?.name ?? companyName);
      setSetupLink(body.setup_link ?? null);
      if (!body.setup_link) {
        setCreateError(
          'Empresa criada, mas o link de primeiro acesso não foi gerado.',
        );
      }
      setCompanyName('');
      setOwnerEmail('');
      setOwnerName('');
      await load();
    } catch {
      setCreateError('Erro de conexão');
    } finally {
      setCreating(false);
    }
  }

  async function copyLink() {
    if (!setupLink) return;
    await navigator.clipboard.writeText(setupLink);
    setCopied(true);
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administração da plataforma</h1>
        <Button variant="outline" onClick={load} disabled={loading}>
          Atualizar
        </Button>
      </div>

      <section className="mb-8 rounded-md border p-4">
        <h2 className="mb-3 text-lg font-medium">Nova empresa</h2>
        <form onSubmit={createAccount} className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="companyName">Nome da empresa</Label>
            <Input
              id="companyName"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerEmail">E-mail do responsável</Label>
            <Input
              id="ownerEmail"
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ownerName">Nome do responsável (opcional)</Label>
            <Input
              id="ownerName"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" disabled={creating}>
              {creating ? 'Criando...' : 'Criar empresa'}
            </Button>
          </div>
        </form>

        {createError && (
          <p className="mt-3 rounded-md border p-3 text-sm">{createError}</p>
        )}

        {setupLink && (
          <div className="mt-3 rounded-md border p-3 text-sm">
            <p className="mb-2 font-medium">
              Empresa &quot;{createdName}&quot; criada. Envie este link de
              primeiro acesso ao responsável (ele escolhe a própria senha). O
              link aparece só agora e expira em cerca de 1 hora.
            </p>
            <Input readOnly value={setupLink} onFocus={(e) => e.target.select()} />
            <Button
              className="mt-2"
              size="sm"
              variant="outline"
              type="button"
              onClick={copyLink}
            >
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        )}
      </section>

      {error && (
        <p className="mb-4 rounded-md border p-3 text-sm">{error}</p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Dono</TableHead>
            <TableHead>Membros</TableHead>
            <TableHead>Criada em</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {accounts.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">{a.name}</TableCell>
              <TableCell>{a.owner_email ?? '-'}</TableCell>
              <TableCell>{a.member_count}</TableCell>
              <TableCell>
                {new Date(a.created_at).toLocaleDateString('pt-BR')}
              </TableCell>
              <TableCell>
                <Badge variant={a.status === 'active' ? 'secondary' : 'destructive'}>
                  {a.status === 'active' ? 'Ativa' : 'Suspensa'}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant={a.status === 'active' ? 'destructive' : 'outline'}
                  disabled={busyId === a.id}
                  onClick={() => changeStatus(a)}
                >
                  {a.status === 'active' ? 'Suspender' : 'Reativar'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && !error && accounts.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>Nenhuma empresa encontrada.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </main>
  );
}