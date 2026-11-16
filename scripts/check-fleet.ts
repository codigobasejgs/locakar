// Frota × locações (chamados: "veículo indisponível aparece na nova locação" e "dashboard com alugados fantasmas")
// e leitura da resposta do Gemini (chamado: "Ler e detectar com IA" retornava erro).
import assert from "node:assert/strict";
import { geminiText, parseAiJson } from "../src/lib/ai-output";
import { busyVehicleIds, canRent, isOngoing, vehicleState } from "../src/lib/reservations";

const rentals = [
  { id: "r1", vehicleId: "v1", status: "active" },
  { id: "r2", vehicleId: "v2", status: "late" },
  { id: "r3", vehicleId: "v3", status: "finished" },
  { id: "r4", vehicleId: "v4", status: "cancelled" },
  { id: "r5", vehicleId: "v5", status: "pending" },
];
const busy = busyVehicleIds(rentals);
assert.deepEqual([...busy].sort(), ["v1", "v2"], "só active/late ocupam o carro");
assert.ok(isOngoing("late") && !isOngoing("pending") && !isOngoing("finished"));
assert.deepEqual([...busyVehicleIds(rentals, "r1")], ["v2"], "editando a própria locação: o carro dela não conta como ocupado");

// Nova locação: some quem está vendido, em manutenção ou com locação em curso.
const fleet = [
  { id: "v1", status: "rented" },
  { id: "v2", status: "available" }, // status gravado velho, mas há locação em atraso
  { id: "v3", status: "rented" }, // locação finalizada: status gravado ficou velho
  { id: "v6", status: "maintenance" },
  { id: "v7", status: "sold" },
  { id: "v8", status: "available" },
  { id: "v9", status: "reserved" },
];
assert.deepEqual(fleet.filter((v) => canRent(v, busy)).map((v) => v.id), ["v3", "v8", "v9"]);

// Dashboard: alugados = locações em curso, não o status gravado.
const state = fleet.map((v) => vehicleState(v, busy));
assert.deepEqual(state, ["rented", "rented", "available", "maintenance", "sold", "available", "reserved"]);
assert.equal(state.filter((s) => s === "rented").length, 2, "3 carros 'Alugado' gravados, mas 2 locações em curso");
assert.equal(vehicleState({ id: "v1", status: "maintenance" }, busy), "maintenance", "manutenção decidida pela equipe prevalece");

// Gemini Interactions API: texto em steps[].content[] (output_text só existe nos SDKs).
const interaction = { status: "completed", steps: [{ type: "thought", content: [{ type: "text", text: "pensando" }] }, { type: "model_output", content: [{ type: "text", text: '{"fields":[' }, { type: "text", text: "]}" }] }] };
assert.equal(geminiText(interaction), '{"fields":[]}');
assert.equal(geminiText({ output_text: "sdk" }), "sdk");
assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: "antigo" }] } }] }), "antigo");
assert.equal(geminiText({ status: "failed", steps: [] }), "");
assert.equal(geminiText(null), "");
assert.deepEqual(parseAiJson('```json\n{"fields":[{"id":"1"}]}\n```'), { fields: [{ id: "1" }] });
assert.throws(() => parseAiJson("não é json"));

console.log("✓ fleet ok");
