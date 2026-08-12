-- Segundo provedor de WhatsApp: Meta Cloud API ou Evolution API.
ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS evolution_instance text,
  ADD COLUMN IF NOT EXISTS evolution_instance_token text,
  ADD COLUMN IF NOT EXISTS evolution_remote_jid text;

ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_provider_check;
ALTER TABLE whatsapp_config ADD CONSTRAINT whatsapp_config_provider_check
  CHECK (provider IN ('meta', 'evolution'));

-- Credenciais Meta não existem em conexões Evolution.
ALTER TABLE whatsapp_config ALTER COLUMN phone_number_id DROP NOT NULL;
ALTER TABLE whatsapp_config ALTER COLUMN access_token DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_evolution_instance_key
  ON whatsapp_config (evolution_instance)
  WHERE evolution_instance IS NOT NULL;

