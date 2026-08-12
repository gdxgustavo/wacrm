import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/whatsapp/encryption';
import {
  connectEvolutionInstance,
  configureEvolutionHistory,
  configureEvolutionWebhook,
  createEvolutionInstance,
  deleteEvolutionInstance,
  evolutionConnectionState,
  evolutionInstanceName,
  findEvolutionWebhook,
  newInstanceToken,
} from '@/lib/whatsapp/evolution-api';

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, accountId: null };
  const { data: profile } = await supabase.from('profiles').select('account_id, account_role').eq('user_id', user.id).maybeSingle();
  return { supabase, user, accountId: profile?.account_id as string | null, role: profile?.account_role as string | null };
}

function qrFrom(body: Record<string, unknown>) {
  const qr = body.qrcode as Record<string, unknown> | undefined;
  return (qr?.base64 ?? body.base64 ?? body.code) as string | undefined;
}

export async function GET() {
  try {
    const { supabase, user, accountId } = await context();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!accountId) return NextResponse.json({ error: 'Seu perfil não está vinculado a uma conta.' }, { status: 403 });
    const { data: config } = await supabase.from('whatsapp_config').select('provider, evolution_instance, status, evolution_remote_jid').eq('account_id', accountId).maybeSingle();
    if (!config || config.provider !== 'evolution' || !config.evolution_instance) return NextResponse.json({ configured: false, provider: config?.provider ?? null });
    const state = await evolutionConnectionState(config.evolution_instance);
    const instance = (state.instance ?? state) as Record<string, unknown>;
    const value = String(instance.state ?? instance.status ?? '').toLowerCase();
    const connected = value === 'open' || value === 'connected';
    if (connected !== (config.status === 'connected')) await supabase.from('whatsapp_config').update({ status: connected ? 'connected' : 'disconnected', connected_at: connected ? new Date().toISOString() : null }).eq('account_id', accountId);
    let webhookConfigured = false;
    try {
      const webhook = await findEvolutionWebhook(config.evolution_instance);
      const outer = (webhook.webhook ?? webhook) as Record<string, unknown>;
      const saved = (outer.webhook ?? outer) as Record<string, unknown>;
      webhookConfigured = Boolean(
        saved.enabled !== false &&
          (saved.url || saved.webhookUrl || outer.webhookUrl)
      );
    } catch {
      // Connection status remains useful even when this Evolution version
      // does not expose /webhook/find.
    }
    return NextResponse.json({ configured: true, provider: 'evolution', connected, state: value, instance: config.evolution_instance, number: config.evolution_remote_jid, webhookConfigured });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao consultar a Evolution API' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, accountId, role } = await context();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!accountId) return NextResponse.json({ error: 'Seu perfil não está vinculado a uma conta.' }, { status: 403 });
    if (role !== 'owner' && role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem alterar a conexão.' }, { status: 403 });
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || new URL(request.url).origin;
    const webhookSecret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (!webhookSecret) throw new Error('Defina EVOLUTION_WEBHOOK_SECRET na Hostinger.');
    const instanceName = evolutionInstanceName(accountId);
    const token = newInstanceToken();
    let created: Record<string, unknown>;
    try {
      created = await createEvolutionInstance({ instanceName, token, webhookUrl: `${origin}/api/whatsapp/evolution/webhook?secret=${encodeURIComponent(webhookSecret)}` });
    } catch (error) {
      if (!(error instanceof Error) || !/already|exist|403/i.test(error.message)) throw error;
      created = await connectEvolutionInstance(instanceName);
    }
    const webhookUrl = `${origin}/api/whatsapp/evolution/webhook?secret=${encodeURIComponent(webhookSecret)}`;
    await configureEvolutionWebhook(instanceName, webhookUrl);
    await configureEvolutionHistory(instanceName);
    const row = { account_id: accountId, user_id: user.id, provider: 'evolution', evolution_instance: instanceName, evolution_instance_token: encrypt(token), phone_number_id: null, waba_id: null, access_token: null, verify_token: null, status: 'disconnected', updated_at: new Date().toISOString() };
    const { error: dbError } = await supabase.from('whatsapp_config').upsert(row, { onConflict: 'account_id' });
    if (dbError) throw new Error(`Banco de dados: ${dbError.message}. Execute a migração 027.`);
    return NextResponse.json({ success: true, instance: instanceName, qrcode: qrFrom(created) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao criar conexão Evolution' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, user, accountId, role } = await context();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!accountId) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 403 });
    if (role !== 'owner' && role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem reparar a integração.' }, { status: 403 });
    const { data: config } = await supabase.from('whatsapp_config').select('provider,evolution_instance').eq('account_id', accountId).maybeSingle();
    if (config?.provider !== 'evolution' || !config.evolution_instance) return NextResponse.json({ error: 'Instância Evolution não encontrada.' }, { status: 404 });
    const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (!secret) throw new Error('Defina EVOLUTION_WEBHOOK_SECRET na Hostinger.');
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || new URL(request.url).origin;
    const webhookUrl = `${origin}/api/whatsapp/evolution/webhook?secret=${encodeURIComponent(secret)}`;
    await configureEvolutionWebhook(config.evolution_instance, webhookUrl);
    await configureEvolutionHistory(config.evolution_instance);
    const webhook = await findEvolutionWebhook(config.evolution_instance).catch(() => null);
    return NextResponse.json({ success: true, webhookConfigured: true, webhook });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao reparar a integração' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const { supabase, user, accountId, role } = await context();
    if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    if (!accountId) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 403 });
    if (role !== 'owner' && role !== 'admin') return NextResponse.json({ error: 'Apenas administradores podem desconectar.' }, { status: 403 });
    const { data: config } = await supabase.from('whatsapp_config').select('evolution_instance').eq('account_id', accountId).maybeSingle();
    if (config?.evolution_instance) await deleteEvolutionInstance(config.evolution_instance).catch(() => undefined);
    await supabase.from('whatsapp_config').delete().eq('account_id', accountId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Falha ao desconectar' }, { status: 500 });
  }
}
