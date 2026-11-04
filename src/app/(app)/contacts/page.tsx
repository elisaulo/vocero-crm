import { getDb, schema } from "@/lib/db";
import { getSessionOrNull } from "@/lib/auth/session";
import { scoped } from "@/lib/db/tenant";
import { ContactsClient } from "@/components/contacts/contacts-client";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const session = await getSessionOrNull();
  if (!session) {
    return <ContactsClient whatsappProvider="meta" />;
  }

  const [org] = await getDb()
    .select({ whatsappProvider: schema.organization.whatsappProvider })
    .from(schema.organization)
    .where(scoped(schema.organization.id, session.organizationId))
    .limit(1);

  return <ContactsClient whatsappProvider={org?.whatsappProvider ?? "meta"} />;
}
