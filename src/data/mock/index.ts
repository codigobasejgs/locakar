/**
 * Dados de DEMONSTRAÇÃO — 100% fictícios (nomes, CPFs, placas, telefones e valores).
 * Nenhum dado pessoal da planilha original é reproduzido aqui.
 * Datas são relativas ao dia do primeiro acesso para o painel sempre parecer "vivo".
 */
import { PUBLIC_FLEET } from "@/data/fleet";
import { addDays, cpfCheckDigits, todayISO } from "@/lib/utils";
import type {
  Client,
  Expense,
  Fine,
  FleetVehicle,
  Maintenance,
  Note,
  Rental,
  Receipt,
  Reservation,
  VehicleStatus,
} from "@/types";

const [MOBI, KWID] = PUBLIC_FLEET;
const d = (offset: number) => addDays(todayISO(), offset);

/* ---------- Veículos ---------- */

const VEHICLE_ROWS: [string, "mobi" | "kwid", VehicleStatus, number, number][] = [
  // id, modelo, status, ano, valor de compra
  ["v01", "mobi", "rented", 2023, 58900],
  ["v02", "mobi", "rented", 2023, 58900],
  ["v03", "kwid", "rented", 2024, 64900],
  ["v04", "kwid", "rented", 2024, 64900],
  ["v05", "mobi", "rented", 2024, 61500],
  ["v06", "kwid", "rented", 2023, 62300],
  ["v07", "mobi", "reserved", 2024, 61500],
  ["v08", "kwid", "available", 2024, 64900],
  ["v09", "mobi", "maintenance", 2022, 54800],
  ["v10", "kwid", "available", 2023, 62300],
];

export const seedVehicles = (): FleetVehicle[] =>
  VEHICLE_ROWS.map(([id, model, status, year, purchaseValue], i) => {
    const base = model === "mobi" ? MOBI : KWID;
    return {
      ...base,
      id,
      name: base.name,
      year,
      status,
      plate: `LKR${i}${String.fromCharCode(65 + i)}${String(10 + i * 7).slice(-2)}`,
      vehicleType: "Carro",
      purchaseDate: d(-420 - i * 35),
      purchaseValue,
      yearModel: `${year}/${year}`,
      renavam: `0${(1234567890 + i * 1117).toString()}`,
      ipvaValue: Math.round(purchaseValue * 0.04),
      ipvaStatus: i % 4 === 3 ? "open" : "paid",
      licensingMonth: ["Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"][i],
      licensingStatus: i === 9 ? "open" : i === 8 ? "late" : "paid",
      weeklyRate: model === "mobi" ? 650 : 700,
      notes: status === "maintenance" ? "Revisão preventiva em andamento." : undefined,
    };
  });

/* ---------- Clientes ---------- */

const CLIENT_NAMES = [
  "Ana Beatriz Moreira",
  "Bruno Carvalho Lima",
  "Camila Duarte Rocha",
  "Diego Fernandes Alves",
  "Eduarda Martins Costa",
  "Felipe Nogueira Santos",
  "Gabriela Ribeiro Pinto",
  "Henrique Souza Barros",
  "Isabela Teixeira Cruz",
  "João Pedro Almeida",
];
const STREETS = ["Rua das Acácias", "Av. dos Ipês", "Rua das Palmeiras", "Rua dos Girassóis", "Av. das Hortênsias"];

export const seedClients = (): Client[] =>
  CLIENT_NAMES.map((name, i) => {
    const base9 = String(123456780 + i * 111111).slice(0, 9);
    return {
      id: `c${String(i + 1).padStart(2, "0")}`,
      code: i + 1,
      registeredAt: d(-300 + i * 22),
      name,
      phone: `(19) 90000-${String(1000 + i * 111).slice(-4)}`,
      cpf: `${base9.slice(0, 3)}.${base9.slice(3, 6)}.${base9.slice(6, 9)}-${cpfCheckDigits(base9)}`,
      address: `${STREETS[i % STREETS.length]}, ${100 + i * 37} — Centro`,
      firstLicenseDate: d(-3650 - i * 180),
      cnhExpiry: i === 2 ? d(9) : i === 6 ? d(-4) : d(200 + i * 60),
      notes: i === 0 ? "Cliente recorrente, prefere retirada pela manhã." : undefined,
    };
  });

/* ---------- Locações ---------- */

function weeklyReceipts(rentalId: string, start: string, end: string, rate: number, paidUntil: string): Receipt[] {
  const receipts: Receipt[] = [];
  for (let due = start, n = 1; due <= end; due = addDays(due, 7), n++) {
    receipts.push({ id: `${rentalId}-r${n}`, dueDate: due, amount: rate, paid: due <= paidUntil });
  }
  return receipts;
}

const RENTAL_ROWS: [string, string, string, number, number, Rental["status"], string][] = [
  // id, cliente, veículo, início, fim (offset em dias), status, tipo
  ["l01", "c01", "v01", -140, 30, "active", "Semanal"],
  ["l02", "c02", "v02", -110, 45, "active", "Semanal"],
  ["l03", "c03", "v03", -90, 20, "active", "Mensal"],
  ["l04", "c04", "v04", -60, 60, "active", "Semanal"],
  ["l05", "c05", "v05", -45, 15, "late", "Semanal"],
  ["l06", "c06", "v06", -28, 35, "active", "Quinzenal"],
  ["l07", "c07", "v08", -200, -120, "finished", "Semanal"],
  ["l08", "c08", "v10", -170, -100, "finished", "Mensal"],
  ["l09", "c09", "v09", -95, -40, "finished", "Semanal"],
  ["l10", "c04", "v10", 45, 75, "pending", "Semanal"],
];

export const seedRentals = (): Rental[] => {
  const vehicles = seedVehicles();
  return RENTAL_ROWS.map(([id, clientId, vehicleId, s, e, status, contractType], i) => {
    const startDate = d(s);
    const endDate = d(e);
    const weeklyRate = vehicles.find((v) => v.id === vehicleId)?.weeklyRate ?? 650;
    const paidUntil = status === "late" ? d(-10) : status === "pending" ? d(-999) : d(0);
    const kmStart = 18000 + i * 4200;
    const finished = status === "finished";
    return {
      id,
      clientId,
      vehicleId,
      contractType,
      startDate,
      startTime: "09:00",
      endDate,
      endTime: "18:00",
      paymentWeekday: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"][i % 5],
      deposit: 800,
      kmStart,
      kmEnd: finished ? kmStart + 2400 + i * 310 : undefined,
      weeklyRate,
      receipts: weeklyReceipts(id, startDate, finished ? endDate : d(0), weeklyRate, paidUntil),
      status,
      notes: status === "late" ? "Pagamento da última semana em atraso — contato agendado." : undefined,
    };
  });
};

/* ---------- Reservas ---------- */

const RESERVATION_ROWS: [string, string, string, number, number, Reservation["status"]][] = [
  ["r01", "c10", "v07", 3, 33, "confirmed"],
  ["r02", "c01", "v08", 5, 12, "confirmed"],
  ["r03", "c03", "v10", 8, 22, "pending"],
  ["r04", "c05", "v08", 16, 30, "pending"],
  ["r05", "c07", "v10", 25, 40, "confirmed"],
  ["r06", "c02", "v09", 14, 21, "pending"],
  ["r07", "c08", "v08", -30, -20, "completed"],
  ["r08", "c09", "v10", -12, -6, "cancelled"],
];

export const seedReservations = (): Reservation[] =>
  RESERVATION_ROWS.map(([id, clientId, vehicleId, s, e, status]) => ({
    id,
    clientId,
    vehicleId,
    startDate: d(s),
    endDate: d(e),
    status,
  }));

/* ---------- Despesas ---------- */

const EXPENSE_ROWS: [number, string, string | undefined, string, number, boolean, string, Expense["category"]][] = [
  [-150, "Seguro da frota", undefined, "Seguradora Exemplo", 2400, true, "Boleto", "recurring"],
  [-120, "Rastreamento veicular", undefined, "Rastreio Demo", 380, true, "PIX", "recurring"],
  [-95, "Troca de pneus", "v03", "Pneus Modelo", 1640, true, "Cartão de crédito", "misc"],
  [-75, "Seguro da frota", undefined, "Seguradora Exemplo", 2400, true, "Boleto", "recurring"],
  [-60, "Lavagem e higienização", "v01", "Lava Rápido Demo", 180, true, "PIX", "misc"],
  [-40, "Rastreamento veicular", undefined, "Rastreio Demo", 380, true, "PIX", "recurring"],
  [-25, "Documentação e emplacamento", "v10", "Despachante Exemplo", 520, true, "Transferência", "misc"],
  [-12, "Alinhamento e balanceamento", "v05", "Auto Center Demo", 260, true, "Cartão de débito", "misc"],
  [-5, "Seguro da frota", undefined, "Seguradora Exemplo", 2400, false, "Boleto", "recurring"],
  [6, "Rastreamento veicular", undefined, "Rastreio Demo", 380, false, "PIX", "recurring"],
];

export const seedExpenses = (): Expense[] =>
  EXPENSE_ROWS.map(([off, description, vehicleId, supplier, amount, paid, paymentMethod, category], i) => ({
    id: `e${String(i + 1).padStart(2, "0")}`,
    date: d(off),
    description,
    vehicleId,
    supplier,
    amount,
    paid,
    paymentMethod,
    category,
  }));

/* ---------- Manutenção ---------- */

const MAINTENANCE_ROWS: [number, string, string, number, number, string, number, Maintenance["status"]][] = [
  [-160, "v01", "Troca de óleo e filtros", 20500, 30500, "Oficina Demo", 320, "done"],
  [-130, "v04", "Revisão de freios", 31200, 41200, "Oficina Demo", 540, "done"],
  [-85, "v06", "Troca de óleo e filtros", 26800, 36800, "Oficina Demo", 320, "done"],
  [-50, "v02", "Substituição de bateria", 24400, 0, "Auto Elétrica Exemplo", 480, "done"],
  [-20, "v08", "Revisão dos 30.000 km", 30100, 40100, "Concessionária Demo", 890, "done"],
  [-2, "v09", "Revisão preventiva completa", 45200, 55200, "Oficina Demo", 950, "pending"],
  [10, "v03", "Troca de óleo programada", 29800, 39800, "Oficina Demo", 320, "scheduled"],
  [24, "v05", "Revisão de suspensão", 38400, 48400, "Oficina Demo", 610, "scheduled"],
];

export const seedMaintenance = (): Maintenance[] =>
  MAINTENANCE_ROWS.map(([off, vehicleId, description, currentKm, nextKm, supplier, amount, status], i) => ({
    id: `m${String(i + 1).padStart(2, "0")}`,
    date: d(off),
    vehicleId,
    description,
    currentKm,
    nextKm: nextKm || undefined,
    supplier,
    amount,
    status,
  }));

/* ---------- Multas ---------- */

const FINE_ROWS: [string, string, number, string, number, Fine["status"]][] = [
  ["c01", "v01", -70, "Excesso de velocidade até 20%", 130.16, "paid"],
  ["c04", "v04", -35, "Estacionar em local proibido", 195.23, "identify"],
  ["c05", "v05", -20, "Avançar sinal vermelho", 293.47, "pending"],
  ["c02", "v02", -60, "Uso de celular ao dirigir", 293.47, "overdue"],
  ["c06", "v06", -15, "Excesso de velocidade até 20%", 130.16, "contested"],
];

export const seedFines = (): Fine[] =>
  FINE_ROWS.map(([clientId, vehicleId, off, description, amount, status], i) => {
    const infractionDate = d(off);
    const paid = status === "paid";
    return {
      id: `f${String(i + 1).padStart(2, "0")}`,
      clientId,
      realOffender: status === "identify" ? undefined : seedClients().find((c) => c.id === clientId)?.name,
      vehicleId,
      noticeNumber: `DEMO${String(482100 + i * 1379)}`,
      infractionDate,
      driverIdDeadline: addDays(infractionDate, 30),
      discountDeadline: addDays(infractionDate, 40),
      description,
      dueDate: addDays(infractionDate, 45),
      amount,
      paymentDate: paid ? addDays(infractionDate, 20) : undefined,
      amountPaid: paid ? Math.round(amount * 0.8 * 100) / 100 : undefined,
      status,
      notes: status === "contested" ? "Recurso protocolado — aguardando julgamento." : undefined,
    };
  });

/* ---------- Anotações ---------- */

const NOTE_ROWS: [number, string, string | undefined, string][] = [
  [0, "08:40", "c05", "Cliente informou que fará o pagamento da semana até sexta-feira."],
  [-1, "17:15", "c10", "Reserva confirmada. Retirada prevista com documentação completa."],
  [-2, "10:05", undefined, "Agendada revisão preventiva do veículo em manutenção."],
  [-4, "14:30", "c03", "Solicitou troca de horário de devolução para o período da tarde."],
  [-6, "09:20", "c04", "Multa recebida — enviar formulário de identificação do condutor."],
  [-9, "16:45", undefined, "Renovação do seguro da frota em negociação."],
  [-13, "11:00", "c01", "Renovou contrato semanal por mais quatro semanas."],
  [-18, "15:10", "c06", "Vistoria de entrega realizada sem avarias."],
  [-24, "09:50", "c08", "Devolução concluída. Caução liberada."],
  [-31, "13:25", undefined, "Atualizada a planilha de licenciamento da frota."],
];

export const seedNotes = (): Note[] =>
  NOTE_ROWS.map(([off, time, clientId, description], i) => ({
    id: `n${String(i + 1).padStart(2, "0")}`,
    date: d(off),
    time,
    clientId,
    description,
  }));
