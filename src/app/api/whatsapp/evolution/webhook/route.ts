import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

type EvolutionMessage = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  pushName?: string;
  messageType?: string;
  messageTimestamp?: number | string;
  message?: Record<string, unknown>;
};

type EvolutionPayload = {
  event?: string;
  instance?: string;
  data?: EvolutionMessage | EvolutionMessage[] | {
    state?: string;
    statusReason?: number;
  };
};

function textOf(message: Record<string, unknown> | undefined) {
  if (!message) return { text: '', type: 'text' };
  if (typeof message.conversation === 'string') return { text: message.conversation, type: 'text' };
  const extended = message.extendedTextMessage as { text?: string } | undefined;
  if (extended?.text) return { text: extended.text, type: 'text' };
  const image = message.imageMessage as { caption?: string; url?: string } | undefined;
  if (image) return { text: image.caption ?? '[Imagem]', type: 'image', media: image.url };
  const video = message.videoMessage as { caption?: string; url?: string } | undefined;
  if (video) return { text: video.caption ?? '[Vídeo]', type: 'video', media: video.url };
  const audio = message.audioMessage as { url?: string } | undefined;
  if (audio) return { text: '[Áudio]', type: 'audio', media: audio.url };
  const doc = message.documentMessage as { fileName?: string; url?: string } | undefined;
  if (doc) return { text: doc.fileName ?? '[Documento]', type: 'document', media: doc.url };
  return { text: '[Mensagem]', type: 'text' };
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!expected || url.searchParams.get('secret') !== expected) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  let body: EvolutionPayload;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const instance = body.instance;
  if (!instance) return NextResponse.json({ received: true });
  const db = admin();
  const { data: config } = await db.from('whatsapp_config').select('account_id,user_id').eq('provider', 'evolution').eq('evolution_instance', instance).maybeSingle();
  if (!config) return NextResponse.json({ received: true });
  const event = String(body.event ?? '').toUpperCase().replace(/[.\-]/g, '_');
  if (event === 'CONNECTION_UPDATE') {
    const stateData = !Array.isArray(body.data) ? body.data : undefined;
    const state = String(stateData && 'state' in stateData ? stateData.state : '').toLowerCase();
    const connected = state === 'open' || state === 'connected';
    await db.from('whatsapp_config').update({ status: connected ? 'connected' : 'disconnected', connected_at: connected ? new Date().toISOString() : null }).eq('evolution_instance', instance);
    return NextResponse.json({ received: true });
  }
  if (event !== 'MESSAGES_UPSERT' && event !== 'MESSAGES_SET') return NextResponse.json({ received: true });
  const items = Array.isArray(body.data) ? body.data : body.data ? [body.data as EvolutionMessage] : [];
  for (const data of items) await persistMessage(db, config, data, event === 'MESSAGES_SET');
  return NextResponse.json({ received: true });
}

async function persistMessage(
  db: ReturnType<typeof admin>,
  config: { account_id: string; user_id: string },
  data: EvolutionMessage,
  historical: boolean
) {
  const key = data.key;
  if (!key) return;
  const remoteJid = key.remoteJid ?? '';
  if (!remoteJid.endsWith('@s.whatsapp.net')) return;
  const phone = remoteJid.split('@')[0];
  const name = data.pushName || phone;
  let { data: contact } = await db.from('contacts').select('id').eq('account_id', config.account_id).eq('phone_normalized', phone).maybeSingle();
  if (!contact) {
    const inserted = await db.from('contacts').insert({ account_id: config.account_id, user_id: config.user_id, name, phone, phone_normalized: phone }).select('id').single();
    contact = inserted.data;
  }
  if (!contact) return;
  let { data: conversation } = await db.from('conversations').select('id,unread_count').eq('account_id', config.account_id).eq('contact_id', contact.id).maybeSingle();
  if (!conversation) {
    const inserted = await db.from('conversations').insert({ account_id: config.account_id, user_id: config.user_id, contact_id: contact.id, status: 'open', unread_count: 0 }).select('id,unread_count').single();
    conversation = inserted.data;
  }
  if (!conversation) return;
  const parsed = textOf(data.message);
  const timestamp = Number(data.messageTimestamp || Date.now() / 1000);
  const createdAt = new Date(timestamp * 1000).toISOString();
  const { data: existing } = key.id
    ? await db.from('messages').select('id').eq('message_id', key.id).maybeSingle()
    : { data: null };
  if (!existing) {
    await db.from('messages').insert({ conversation_id: conversation.id, sender_type: key.fromMe ? 'agent' : 'customer', content_type: parsed.type, content_text: parsed.text, media_url: parsed.media ?? null, message_id: key.id, status: key.fromMe ? 'sent' : 'delivered', created_at: createdAt });
  }
  const currentLast = await db.from('conversations').select('last_message_at').eq('id', conversation.id).single();
  if (!currentLast.data?.last_message_at || new Date(createdAt) >= new Date(currentLast.data.last_message_at)) {
    await db.from('conversations').update({ last_message_text: parsed.text, last_message_at: createdAt, unread_count: !key.fromMe && !historical && !existing ? (conversation.unread_count ?? 0) + 1 : conversation.unread_count ?? 0, updated_at: new Date().toISOString() }).eq('id', conversation.id);
  }
}
