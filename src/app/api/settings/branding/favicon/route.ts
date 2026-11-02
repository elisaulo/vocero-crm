import { apiError, withAuth } from "@/lib/api";

export const PUT = withAuth(async () => {
  return apiError(404, "logo_bloqueado", "El logo de este CRM es fijo y no se puede reemplazar");
});

export const DELETE = withAuth(async () => {
  return apiError(404, "logo_bloqueado", "El logo de este CRM es fijo y no se puede reemplazar");
});
