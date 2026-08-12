'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, QrCode, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Status = { configured: boolean; connected?: boolean; state?: string; instance?: string; number?: string; provider?: string | null };

export function EvolutionConfig({ active = false }: { active?: boolean }) {
  const [status, setStatus] = useState<Status>({ configured: active });
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/evolution', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao consultar conexão');
      setStatus(data);
    } catch (error) {
      if (active) toast.error(error instanceof Error ? error.message : 'Falha ao consultar conexão');
    }
  }, [active]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!status.configured || status.connected) return;
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [status.configured, status.connected, refresh]);

  async function connect() {
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/evolution', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao gerar QR Code');
      setQr(data.qrcode ?? null);
      setStatus({ configured: true, connected: false, state: 'connecting', instance: data.instance, provider: 'evolution' });
      if (!data.qrcode) toast.info('Instância criada. Clique em Atualizar QR Code.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao conectar');
    } finally { setBusy(false); }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar e excluir esta instância da Evolution API?')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/whatsapp/evolution', { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao desconectar');
      setQr(null); setStatus({ configured: false, provider: null });
      toast.success('Evolution API desconectada');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Falha ao desconectar'); }
    finally { setBusy(false); }
  }

  const qrSrc = qr?.startsWith('data:') ? qr : qr ? `data:image/png;base64,${qr}` : null;
  return (
    <Card className={active ? 'border-primary/50' : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div><CardTitle className="flex items-center gap-2"><QrCode className="size-5" /> Evolution API — QR Code</CardTitle><CardDescription>Conecte o WhatsApp como aparelho vinculado. O servidor Evolution é administrado pelo KenzyCRM.</CardDescription></div>
          {status.connected && <span className="flex items-center gap-1 text-sm text-emerald-500"><Wifi className="size-4" /> Conectado</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {qrSrc && !status.connected && <div className="flex justify-center rounded-lg bg-white p-4"><img src={qrSrc} alt="QR Code para conectar o WhatsApp" className="size-64 max-w-full" /></div>}
        {status.configured && !status.connected && !qrSrc && <p className="text-muted-foreground text-sm">Instância criada. Gere um novo QR Code para concluir a conexão.</p>}
        {status.connected && <p className="text-sm">WhatsApp conectado{status.number ? `: ${status.number}` : ''}. A caixa de entrada já pode usar esta instância.</p>}
        <div className="flex flex-wrap gap-2">
          {!status.connected && <Button onClick={connect} disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <QrCode className="size-4" />}{status.configured ? 'Atualizar QR Code' : 'Conectar pelo QR Code'}</Button>}
          {status.configured && <Button variant="outline" onClick={() => void refresh()} disabled={busy}><RefreshCw className="size-4" /> Verificar situação</Button>}
          {status.configured && <Button variant="destructive" onClick={disconnect} disabled={busy}><Trash2 className="size-4" /> Desconectar</Button>}
        </div>
        {!status.connected && qrSrc && <p className="text-muted-foreground text-xs">No celular: WhatsApp → Aparelhos conectados → Conectar um aparelho.</p>}
      </CardContent>
    </Card>
  );
}
