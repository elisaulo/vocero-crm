-- 0025: Conversaciones separadas por instancia Evolution (multi-número).
--
-- Reemplaza el índice único (organization_id, contact_id) WHERE is_test=false
-- por dos índices parciales que permiten al mismo contacto tener una conversación
-- por instancia Evolution mientras mantienen la unicidad en Meta/otros canales.
--
-- A) conversation_org_contact_no_evo_uq:
--    Un único hilo real por contacto cuando evolution_instance IS NULL
--    (Meta Cloud API, Instagram, Messenger, TikTok — comportamiento original).
--
-- B) conversation_org_contact_evo_uq:
--    Un único hilo real por contacto POR instancia cuando evolution_instance IS NOT NULL
--    (ej. "vocero_prod" y "Donpremium Vzla" generan conversaciones separadas).

-- Eliminar el índice único anterior (uno por contacto sin distinción de instancia).
DROP INDEX IF EXISTS "conversation_org_contact_real_uq";

-- Índice A: canales sin Evolution (evolution_instance IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_org_contact_no_evo_uq"
  ON "conversation" ("organization_id", "contact_id")
  WHERE is_test = false AND evolution_instance IS NULL;

-- Índice B: Evolution multi-instancia (evolution_instance IS NOT NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "conversation_org_contact_evo_uq"
  ON "conversation" ("organization_id", "contact_id", "evolution_instance")
  WHERE is_test = false AND evolution_instance IS NOT NULL;
