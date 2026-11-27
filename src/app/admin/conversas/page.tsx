"use client";

import { PageHeader } from "@/components/admin/page-header";
import { WhatsAppInbox } from "@/components/admin/whatsapp-inbox";
import { isDemo } from "@/lib/supabase/env";

export default function ConversationsPage() {
  return (
    <>
      <PageHeader tour="conversations" title="Conversas" description="WhatsApp dos clientes em um só lugar: responda como equipe, deixe o menu de botões ou a IA atender e classifique leads com etiquetas." />
      <WhatsAppInbox demo={isDemo} />
    </>
  );
}
