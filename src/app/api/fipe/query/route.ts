import { type FipeInput, type FipeOperation } from "@/lib/fipe";
import { fipeErrorResponse, queryFipe, readFipeBody } from "@/lib/server/fipe";
import { requireStaff } from "@/lib/server/supabase";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export async function POST(request: Request) {
 try {
  await requireStaff(); const b = await readFipeBody(request);
  const data = await queryFipe(b.operation as FipeOperation, (b.parameters ?? {}) as FipeInput);
  return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
 } catch(e) { return fipeErrorResponse(e); }
}
