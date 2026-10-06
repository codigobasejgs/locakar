import { SelsynError } from "@/lib/selsyn";
import { assertSelsynTenant, selsynErrorResponse } from "@/lib/server/selsyn";
import { scoped } from "@/lib/server/org-context";
import { requireStaff } from "@/lib/server/supabase";
export const dynamic = "force-dynamic";

/** Nenhum comando físico até confirmar IMEI, reautenticação e homologação supervisionada. */
export const POST = scoped(async function POST() {
  try {
    await requireStaff("integrations");
    assertSelsynTenant();
    throw new SelsynError("COMMANDS_DISABLED", "Bloqueio/desbloqueio aguardam confirmação do IMEI, proteções de segurança e homologação supervisionada com a Selsyn. Nenhum comando foi enviado.", 409);
  } catch (e) { return selsynErrorResponse(e); }
});
