import type { TourDef } from "../../types";
import { configuracoes } from "./configuracoes";
import { geral } from "./geral";
import { jornadas } from "./jornadas";
import { operacao } from "./operacao";

/** Catálogo carregado sob demanda (import dinâmico): não pesa no carregamento inicial do painel. */
export const tours: TourDef[] = [...geral, ...jornadas, ...operacao, ...configuracoes];

/**
 * Vídeos por id (TourDef.video → URL). A fábrica de vídeos ainda não publicou nenhum:
 * enquanto estiver vazio, nenhum botão "Assistir vídeo" aparece.
 */
export const videos: Record<string, string> = {};
