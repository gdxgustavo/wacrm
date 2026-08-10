/**
 * Starter flow templates.
 *
 * Three pre-canned flows users can clone with one click instead of
 * building from scratch. Each template is a plain JS object describing
 * the same shape `/api/flows` PUT accepts — name, trigger config,
 * entry_node_id, fallback_policy, nodes[] — keyed by a stable
 * `slug`.
 *
 * The clone path (`/api/flows` POST with `template_slug`) creates a
 * NEW flow_row + flow_nodes rows for the user. `node_key`s are kept
 * verbatim (they're stable strings, not UUIDs, so cloning never
 * needs to rewrite edge references).
 *
 * Choosing a single static module over a DB-backed gallery for v1
 * because: (a) the set is small and changes with code releases, not
 * data; (b) keeps templates portable across self-hosted instances
 * without migrations; (c) editing in source is the lowest-friction
 * way to add the next template.
 */

import type {
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
} from './types';

export type FlowTemplateNodeType =
  | 'start'
  | 'send_message'
  | 'send_buttons'
  | 'send_list'
  | 'collect_input'
  | 'condition'
  | 'set_tag'
  | 'handoff'
  | 'end';

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Used by the gallery to surface a relevant icon. lucide-react name. */
  icon: 'MensagemQuadrado' | 'Círculo de Ajuda' | 'Usuário Plus';
  trigger_type: 'keyword' | 'first_inbound_message' | 'manual';
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

// ============================================================
// 1. Welcome menu — the example from the owner's brief
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: 'welcome_menu',
  name: 'Menu de boas-vindas',
  description:
    'Cumprimente os clientes que digitam uma palavra-chave e encaminhe-os para o agente certo com base no fato de serem novos ou existentes.',
  icon: 'MensagemQuadrado',
  trigger_type: 'keyword',
  trigger_config: {
    keywords: ['support', 'help', 'hi'],
    match_type: 'contains',
  },
  entry_node_id: 'start',
  nodes: [
    {
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: 'welcome' },
    },
    {
      node_key: 'welcome',
      node_type: 'send_buttons',
      config: {
        text: 'Oi! 👋 Bem-vindo ao suporte. Você é um cliente existente ou novo aqui?',
        footer_text: 'Toque em um botão abaixo para continuar.',
        buttons: [
          {
            reply_id: 'existing',
            title: 'Cliente existente',
            next_node_key: 'existing_handoff',
          },
          {
            reply_id: 'new',
            title: 'Novo cliente',
            next_node_key: 'new_handoff',
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: 'existing_handoff',
      node_type: 'handoff',
      config: {
        note: 'O cliente existente precisa de assistência – verifique o histórico da conta antes de responder.',
      } as HandoffNodeConfig,
    },
    {
      node_key: 'new_handoff',
      node_type: 'handoff',
      config: {
        note: 'Novo cliente – compartilhe preços + link de integração.',
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. FAQ bot — list-message answers, fully automated
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: 'faq_bot',
  name: 'Bot de perguntas frequentes',
  description:
    'Responda perguntas comuns automaticamente. O cliente escolhe um tópico de uma lista; o bot responde com a resposta e termina.',
  icon: 'Círculo de Ajuda',
  trigger_type: 'keyword',
  trigger_config: {
    keywords: ['faq', 'question', 'info'],
    match_type: 'contains',
  },
  entry_node_id: 'start',
  nodes: [
    {
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: 'topics' },
    },
    {
      node_key: 'topics',
      node_type: 'send_list',
      config: {
        text: 'Em que posso ajudá-lo?',
        button_label: 'Ver tópicos',
        sections: [
          {
            title: 'Perguntas comuns',
            rows: [
              {
                reply_id: 'hours',
                title: 'Horário de funcionamento',
                next_node_key: 'answer_hours',
              },
              {
                reply_id: 'pricing',
                title: 'Preços',
                next_node_key: 'answer_pricing',
              },
              {
                reply_id: 'refunds',
                title: 'Política de reembolso',
                next_node_key: 'answer_refunds',
              },
            ],
          },
          {
            title: 'Outro',
            rows: [
              {
                reply_id: 'human',
                title: 'Fale com um humano',
                next_node_key: 'human_handoff',
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: 'answer_hours',
      node_type: 'send_message',
      config: {
        text: 'Estamos abertos de segunda a sexta, das 9h às 18h, horário local. O suporte de fim de semana é limitado a questões urgentes.',
        next_node_key: 'end',
      } as SendMessageNodeConfig,
    },
    {
      node_key: 'answer_pricing',
      node_type: 'send_message',
      config: {
        text: 'Nosso preço começa em US$ 9/mês. Visite https://example.com/pricing para obter informações completas.',
        next_node_key: 'end',
      } as SendMessageNodeConfig,
    },
    {
      node_key: 'answer_refunds',
      node_type: 'send_message',
      config: {
        text: 'Os reembolsos são honrados dentro de 30 dias após a compra. Responda com o número do seu pedido e nós o processaremos.',
        next_node_key: 'end',
      } as SendMessageNodeConfig,
    },
    {
      node_key: 'human_handoff',
      node_type: 'handoff',
      config: {
        note: 'O cliente pediu para falar com um humano do bot de perguntas frequentes.',
      } as HandoffNodeConfig,
    },
    {
      node_key: 'end',
      node_type: 'end',
      config: {},
    },
  ],
};

// ============================================================
// 3. Lead capture — collect_input chain, ends in a handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: 'lead_capture',
  name: 'Captura de leads',
  description:
    'Cumprimente quem entra pela primeira vez, capture nome + e-mail + empresa e, em seguida, entregue ao setor de vendas com as respostas na nota.',
  icon: 'Usuário Plus',
  trigger_type: 'first_inbound_message',
  trigger_config: {},
  entry_node_id: 'start',
  nodes: [
    {
      node_key: 'start',
      node_type: 'start',
      config: { next_node_key: 'intro' },
    },
    {
      node_key: 'intro',
      node_type: 'send_message',
      config: {
        text: 'Bem-vindo! 👋 Farei algumas perguntas rápidas para que possamos levar você até a pessoa certa.',
        next_node_key: 'ask_name',
      } as SendMessageNodeConfig,
    },
    {
      node_key: 'ask_name',
      node_type: 'collect_input',
      config: {
        prompt_text: 'Qual o seu nome?',
        var_key: 'name',
        next_node_key: 'ask_email',
      } as CollectInputNodeConfig,
    },
    {
      node_key: 'ask_email',
      node_type: 'collect_input',
      config: {
        prompt_text:
          'Obrigado, {{vars.name}}! Qual é o seu e-mail profissional?',
        var_key: 'email',
        next_node_key: 'ask_company',
      } as CollectInputNodeConfig,
    },
    {
      node_key: 'ask_company',
      node_type: 'collect_input',
      config: {
        prompt_text: 'Quase pronto – qual é o nome da sua empresa?',
        var_key: 'company',
        next_node_key: 'handoff',
      } as CollectInputNodeConfig,
    },
    {
      node_key: 'handoff',
      node_type: 'handoff',
      config: {
        note: 'Novo lead — nome={{vars.name}}, e-mail={{vars.email}}, empresa={{vars.company}}.',
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
