import { describe, expect, it, vi, beforeEach } from "vitest";
import { POST as evolutionWebhookPOST } from "@/app/api/webhooks/evolution/route";
import { sendEvolutionText } from "@/lib/evolution";
import { dispatchSendMessage } from "@/lib/messaging-dispatcher";

// Mock DB module for unit tests
interface MockSelectChain {
  from: () => MockSelectChain;
  innerJoin: () => MockSelectChain;
  where: () => MockSelectChain;
  limit: ReturnType<typeof vi.fn>;
}

interface MockInsertChain {
  values: () => MockInsertChain;
  returning: ReturnType<typeof vi.fn>;
}

const selectChain: MockSelectChain = {
  from: () => selectChain,
  innerJoin: () => selectChain,
  where: () => selectChain,
  limit: vi.fn(),
};

const insertChain: MockInsertChain = {
  values: () => insertChain,
  returning: vi.fn(),
};

const updateChain: Record<string, unknown> = {};
updateChain.set = () => updateChain;
updateChain.where = () => updateChain;

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => selectChain,
    insert: () => insertChain,
    update: () => updateChain,
  }),
  schema: {
    organization: {
      id: "id",
      evolutionInstance: "evolution_instance",
      whatsappProvider: "whatsapp_provider",
      evolutionApiUrl: "evolution_api_url",
      evolutionApiKey: "evolution_api_key",
    },
    conversation: { id: "id", contactId: "contact_id", organizationId: "org_id" },
    contact: { id: "id" },
    message: {},
  },
}));

vi.mock("@/server/events/bus", () => ({
  publish: vi.fn(),
}));

vi.mock("@/server/inbox/ingest", () => ({
  ingestInboundMessage: vi.fn().mockResolvedValue(undefined),
  serializeMessage: vi.fn((msg) => msg),
}));

describe("Evolution API - Flujo Completo de Integración", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("a) y b) Webhook entrante POST /api/webhooks/evolution", () => {
    it("procesa un payload messages.upsert y responde status 200 ({ received: true })", async () => {
      const payload = {
        event: "messages.upsert",
        instance: "instancia-test",
        data: {
          key: {
            remoteJid: "5215559998877@s.whatsapp.net",
            fromMe: false,
            id: "evo_in_1001",
          },
          pushName: "Cliente Ejemplo",
          message: {
            conversation: "Hola, quisiera saber los precios de sus servicios",
          },
          messageTimestamp: 1700000000,
        },
      };

      selectChain.limit.mockResolvedValue([
        {
          id: "org_test_123",
          name: "Organización Test",
          evolutionInstance: "instancia-test",
        },
      ]);

      const req = new Request("https://crm.test/api/webhooks/evolution?instance=instancia-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const res = await evolutionWebhookPOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json).toEqual({ received: true });
    });
  });

  describe("c) y d) Salida mediante sendEvolutionText y dispatchSendMessage", () => {
    it("efectúa una llamada HTTP saliente válida POST /message/sendText/{instance} con apikey", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          key: { id: "evo_out_2002" },
          status: "PENDING",
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await sendEvolutionText({
        config: {
          apiUrl: "https://api.evolution.io",
          apiKey: "evo_secret_key_xyz",
          instance: "instancia-test",
        },
        recipient: "5215559998877",
        text: "Hola, con gusto le enviamos nuestro catálogo.",
      });

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe("evo_out_2002");

      expect(fetchMock).toHaveBeenCalledWith(
        "https://api.evolution.io/message/sendText/instancia-test",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: "evo_secret_key_xyz",
          },
          body: JSON.stringify({
            number: "5215559998877",
            text: "Hola, con gusto le enviamos nuestro catálogo.",
          }),
        }
      );

      vi.unstubAllGlobals();
    });

    it("dispatchSendMessage conmuta a Evolution API según la configuración de la org", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          key: { id: "evo_out_3003" },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      selectChain.limit
        .mockResolvedValueOnce([
          {
            id: "org_evo_1",
            whatsappProvider: "evolution",
            evolutionApiUrl: "https://api.evolution.io",
            evolutionApiKey: "key_xyz",
            evolutionInstance: "instancia_evo",
          },
        ])
        .mockResolvedValueOnce([
          {
            conversation: { id: "conv_1", organizationId: "org_evo_1", isTest: false, channel: "whatsapp" },
            contact: { id: "ct_1", phone: "5215551234567", waIdentity: "5215551234567" },
          },
        ]);

      insertChain.returning.mockResolvedValueOnce([
        {
          id: "msg_out_1",
          organizationId: "org_evo_1",
          conversationId: "conv_1",
          waMessageId: "evo_out_3003",
          provider: "evolution",
          direction: "out",
          status: "sent",
          createdAt: new Date(),
        },
      ]);

      const dispatchResult = await dispatchSendMessage({
        conversationId: "conv_1",
        organizationId: "org_evo_1",
        text: "Mensaje despachado mediante Evolution API",
      });

      expect(dispatchResult.provider).toBe("evolution");
      expect(dispatchResult.messageId).toBe("msg_out_1");

      vi.unstubAllGlobals();
    });
  });
});
