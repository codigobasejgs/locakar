/** Autoverificação da lógica pura. Rodar: `npm run check` (usa jiti, já instalado via Tailwind). */
import assert from "node:assert/strict";
import { findConflict } from "../src/lib/reservations";
import { getWhatsAppUrl } from "../src/lib/whatsapp";
import { addDays, cpfCheckDigits, hideCPF, isValidCPF, isValidPlate, maskCPF, maskPhone, monthKey } from "../src/lib/utils";

// WhatsApp oficial
assert.equal(getWhatsAppUrl(), "https://wa.me/5519998615873");
assert.equal(getWhatsAppUrl("Olá, LOCAKAR!"), "https://wa.me/5519998615873?text=Ol%C3%A1%2C%20LOCAKAR!");

// CPF
assert.equal(cpfCheckDigits("529982247"), "25");
assert.ok(isValidCPF("529.982.247-25"));
assert.ok(!isValidCPF("529.982.247-26"));
assert.ok(!isValidCPF("111.111.111-11"));
assert.equal(maskCPF("52998224725"), "529.982.247-25");
assert.equal(hideCPF("529.982.247-25"), "***.982.247-**");

// Telefone e placa
assert.equal(maskPhone("19998615873"), "(19) 99861-5873");
assert.ok(isValidPlate("ABC1234") && isValidPlate("ABC1D23"));
assert.ok(!isValidPlate("AB12345"));

// Datas (virada de mês/ano)
assert.equal(addDays("2026-12-30", 3), "2027-01-02");
assert.equal(monthKey("2026-03-15"), "2026-03");

// Conflito de reservas: sobreposição inclusiva, ignora canceladas e o próprio registro
const booked = [{ id: "a", vehicleId: "v1", startDate: "2026-10-01", endDate: "2026-10-10", status: "confirmed" }];
assert.ok(findConflict(booked, { vehicleId: "v1", startDate: "2026-10-10", endDate: "2026-10-12" }));
assert.equal(findConflict(booked, { vehicleId: "v1", startDate: "2026-10-11", endDate: "2026-10-12" }), undefined);
assert.equal(findConflict(booked, { vehicleId: "v2", startDate: "2026-10-01", endDate: "2026-10-12" }), undefined);
assert.equal(findConflict(booked, { id: "a", vehicleId: "v1", startDate: "2026-10-02", endDate: "2026-10-05" }), undefined);
assert.equal(findConflict([{ ...booked[0], status: "cancelled" }], { vehicleId: "v1", startDate: "2026-10-02", endDate: "2026-10-05" }), undefined);

console.log("✓ check ok");
