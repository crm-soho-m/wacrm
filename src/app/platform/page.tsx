'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Administração da plataforma</h1>
        <Button variant="outline" onClick={load} disabled={loading}>
          Atualizar
        </Button>
      </div>

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