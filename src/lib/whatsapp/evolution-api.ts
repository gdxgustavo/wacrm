import crypto from 'crypto';

function settings() {
  const baseUrl = process.env.EVOLUTION_API_URL?.replace(/\/+$/, '');
  const apiKey = process.env.EVOLUTION_GLOBAL_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error(
      'Evolution API não configurada. Defina EVOLUTION_API_URL e EVOLUTION_GLOBAL_API_KEY.'
    );
  }
  return { baseUrl, apiKey };
}

async function request(path: string, init?: RequestInit) {
  const { baseUrl, apiKey } = settings();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      apikey: apiKey,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const detail =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : text || `HTTP ${response.status}`;
    throw new Error(`Evolution API: ${detail}`);
  }
  return body as Record<string, unknown>;
}

export function evolutionInstanceName(accountId: string) {
  return `kenzycrm-${accountId.replace(/-/g, '').slice(0, 24)}`;
}

export function newInstanceToken() {
  return crypto.randomBytes(32).toString('hex');
}

export async function createEvolutionInstance(args: {
  instanceName: string;
  token: string;
  webhookUrl: string;
}) {
  return request('/instance/create', {
    method: 'POST',
    body: JSON.stringify({
      instanceName: args.instanceName,
      token: args.token,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      settings: {
        syncFullHistory: true,
        groupsIgnore: true,
        readMessages: false,
        readStatus: false,
      },
      webhook: {
        enabled: true,
        url: args.webhookUrl,
        webhookByEvents: false,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_SET',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
        ],
      },
    }),
  });
}

export async function connectEvolutionInstance(instanceName: string) {
  return request(`/instance/connect/${encodeURIComponent(instanceName)}`);
}

export async function evolutionConnectionState(instanceName: string) {
  return request(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

const EVOLUTION_EVENTS = [
  'QRCODE_UPDATED',
  'CONNECTION_UPDATE',
  'MESSAGES_SET',
  'MESSAGES_UPSERT',
  'MESSAGES_UPDATE',
  'SEND_MESSAGE',
];

export async function configureEvolutionWebhook(
  instanceName: string,
  webhookUrl: string
) {
  return request(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      enabled: true,
      url: webhookUrl,
      webhook_by_events: false,
      webhookByEvents: false,
      base64: true,
      events: EVOLUTION_EVENTS,
    }),
  });
}

export async function configureEvolutionHistory(instanceName: string) {
  return request(`/settings/set/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    body: JSON.stringify({
      syncFullHistory: true,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
    }),
  });
}

export async function findEvolutionWebhook(instanceName: string) {
  return request(`/webhook/find/${encodeURIComponent(instanceName)}`);
}

export async function deleteEvolutionInstance(instanceName: string) {
  return request(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: 'DELETE',
  });
}

export async function sendEvolutionText(args: {
  instanceName: string;
  to: string;
  text: string;
}) {
  const result = await request(
    `/message/sendText/${encodeURIComponent(args.instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({ number: args.to, text: args.text }),
    }
  );
  const key = result.key as { id?: string } | undefined;
  return { messageId: key?.id ?? crypto.randomUUID() };
}

export async function sendEvolutionMedia(args: {
  instanceName: string;
  to: string;
  kind: 'image' | 'video' | 'document' | 'audio';
  url: string;
  caption?: string;
  filename?: string;
}) {
  const mediatype = args.kind === 'audio' ? 'audio' : args.kind;
  const result = await request(
    `/message/sendMedia/${encodeURIComponent(args.instanceName)}`,
    {
      method: 'POST',
      body: JSON.stringify({
        number: args.to,
        mediatype,
        mimetype: args.kind === 'audio' ? 'audio/ogg; codecs=opus' : undefined,
        media: args.url,
        caption: args.caption,
        fileName: args.filename,
      }),
    }
  );
  const key = result.key as { id?: string } | undefined;
  return { messageId: key?.id ?? crypto.randomUUID() };
}
