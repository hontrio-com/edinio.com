import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import { ePunctFanbox, normalizeazaPuncteCuriera, rezumaProgramCuriera } from "./puncte";

const ZI = (start: number, end: number) => [{ start, end }];
const SAPTAMANA = (z: unknown, s: unknown = z, d: unknown = z) => ({
  monday: z, tuesday: z, wednesday: z, thursday: z, friday: z, saturday: s, sunday: d,
});

/* Randuri copiate din raspunsul real, 29.09.2026. */
const LOCKER = {
  country: "RO", location_reference: "In dreapta intrarii principale", address: "Bd. Theodor Pallady 51",
  lng: "26.19726", city: "Bucuresti", county: "Bucuresti", type: "locker", zipcode: "032258",
  can_pickup: "1", schedule: SAPTAMANA(ZI(0, 1439)), name: "FANbox Kaufland Theodor Pallady", id: "16478", lat: "44.40874",
};
const OFICIU = {
  country: "RO", location_reference: "", address: "Str. 1 Decembrie, nr. 64/H\r\n ", lng: "22.383857",
  city: "Alesd ", county: "Bihor", type: "office", zipcode: "415100", can_pickup: "1",
  schedule: SAPTAMANA(ZI(540, 1020), [], []), name: "Sediul FAN Alesd", id: "20581", lat: "47.059306",
};

describe("punctele", () => {
  test("forma din checkout, cu trim si coordonate numerice", () => {
    const [l, o] = normalizeazaPuncteCuriera([LOCKER, OFICIU]);
    assert.deepEqual(l, {
      id: "16478", nume: "FANbox Kaufland Theodor Pallady", adresa: "Bd. Theodor Pallady 51",
      oras: "Bucuresti", judet: "Bucuresti", codPostal: "032258", lat: 44.40874, lng: 26.19726,
      tip: "locker", program: "Non-stop",
    });
    assert.equal(o.adresa, "Str. 1 Decembrie, nr. 64/H");
    assert.equal(o.oras, "Alesd");
    assert.equal(o.program, "L-V 09:00-17:00; S-D inchis");
  });

  test("⚠ punctele de unde nu se poate ridica se scot", () => {
    assert.deepEqual(normalizeazaPuncteCuriera([{ ...LOCKER, can_pickup: "0" }]), []);
  });

  test("fara id numeric, fara coordonate sau de tip necunoscut nu trec; dublurile nici", () => {
    const r = normalizeazaPuncteCuriera([
      { ...LOCKER, id: "" }, { ...LOCKER, id: "x1" }, { ...LOCKER, lat: "" }, { ...LOCKER, type: "depozit" },
      LOCKER, LOCKER,
    ]);
    assert.equal(r.length, 1);
  });

  test("ce nu e lista da lista goala", () => {
    assert.deepEqual(normalizeazaPuncteCuriera({ status: "failed" }), []);
    assert.deepEqual(normalizeazaPuncteCuriera(null), []);
  });
});

describe("lockerul FANbox, dupa nume", () => {
  test("toate lockerele lor se numesc FANbox; pudo si oficiile nu", () => {
    assert.ok(ePunctFanbox("FANbox Kaufland Theodor Pallady"));
    assert.ok(ePunctFanbox(" fanbox Lidl"));
    assert.ok(!ePunctFanbox("Sediul FAN Alesd"));
    assert.ok(!ePunctFanbox("_Nir Team Nineteen SRL"));
    assert.ok(!ePunctFanbox(undefined));
  });
});

describe("programul", () => {
  test("zilele la rand cu acelasi program se grupeaza", () => {
    assert.equal(rezumaProgramCuriera(SAPTAMANA(ZI(480, 1200))), "L-D 08:00-20:00");
    assert.equal(rezumaProgramCuriera(SAPTAMANA(ZI(480, 960), ZI(0, 0), ZI(0, 0))), "L-V 08:00-16:00; S-D inchis");
    assert.equal(rezumaProgramCuriera(SAPTAMANA(ZI(480, 1200), ZI(540, 840), [])), "L-V 08:00-20:00; S 09:00-14:00; D inchis");
  });

  test("⚠ toate zilele goale inseamna ca nu stim, nu „inchis permanent”", () => {
    assert.equal(rezumaProgramCuriera(SAPTAMANA([])), null);
  });

  test("o zi de forma necunoscuta face tot programul necunoscut", () => {
    assert.equal(rezumaProgramCuriera({ ...SAPTAMANA(ZI(480, 1200)), friday: "08-20" }), null);
    assert.equal(rezumaProgramCuriera(null), null);
  });
});
