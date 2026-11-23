import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AFTER_HOURS_FEE,
  DESK_FEE,
  DISPATCH_FEE,
  PILOT_NIGHTS,
  PILOT_STOPS_A_NIGHT,
  ROADSIDE_CAP,
  TOWY_RATE,
  atCurb,
  blankJob,
  buildCalls,
  carLabel,
  halfwayUpdate,
  helpLabel,
  milesBetween,
  needsShop,
  phoneOk,
  pilotMonth,
  recommendEquipment,
  recommendPolice,
  recommendWinch,
  round2,
  splitBill,
  usd,
  vehicleOk,
  workLabel,
  type Job,
  type Situation,
  type Vehicle,
} from "./model.ts";

function baseVehicle(patch: Partial<Vehicle> = {}): Vehicle {
  return {
    year: "2019",
    make: "Honda",
    model: "Civic",
    drivetrain: "FWD",
    tires: "215/55R16",
    ev: false,
    ...patch,
  };
}

function baseSituation(patch: Partial<Situation> = {}): Situation {
  return {
    starts: false,
    rolls: true,
    position: "shoulder",
    side: "right",
    equipment: "wheel-lift",
    winch: false,
    police: false,
    equipmentTouched: true,
    winchTouched: true,
    policeTouched: true,
    spare: true,
    wrongFuel: false,
    shattered: false,
    broken: false,
    ...patch,
  };
}

function jobWith(patch: Partial<Job> = {}): Job {
  return {
    ...blankJob("member"),
    vehicle: baseVehicle(),
    help: "tow",
    situation: baseSituation(),
    locationId: "i70-108",
    coverage: "roadside",
    ...patch,
  };
}

describe("splitBill", () => {
  it("charges the member 6% of what they pay, and nothing to a carrier, when there is no coverage", () => {
    const member = splitBill(200, "none", "member");
    assert.equal(member.covered, 0);
    assert.equal(member.driverPays, 200);
    assert.equal(member.towyFee, round2(200 * TOWY_RATE));
    assert.equal(member.dispatchFee, 0);
    assert.equal(member.operatorReceives, round2(200 - member.towyFee));

    const insurer = splitBill(200, "none", "insurer");
    assert.equal(insurer.towyFee, 0);
    assert.equal(insurer.dispatchFee, DISPATCH_FEE);
    assert.equal(insurer.operatorReceives, 200);
  });

  it("caps roadside coverage at $125 and takes the 6% cut only from the member share", () => {
    const over = splitBill(200, "roadside", "member");
    assert.equal(over.covered, ROADSIDE_CAP);
    assert.equal(over.driverPays, 75);
    assert.equal(over.towyFee, round2(75 * TOWY_RATE));
    assert.equal(over.dispatchFee, 0);
    assert.equal(over.operatorReceives, round2(200 - over.towyFee));

    const under = splitBill(80, "roadside", "member");
    assert.equal(under.covered, 80);
    assert.equal(under.driverPays, 0);
    assert.equal(under.towyFee, 0);
    assert.equal(under.operatorReceives, 80);
  });

  it("leaves a $100 deductible on the member and covers the rest", () => {
    const over = splitBill(200, "deductible", "member");
    assert.equal(over.covered, 100);
    assert.equal(over.driverPays, 100);
    assert.equal(over.towyFee, round2(100 * TOWY_RATE));

    const under = splitBill(50, "deductible", "member");
    assert.equal(under.covered, 0);
    assert.equal(under.driverPays, 50);
    assert.equal(under.towyFee, round2(50 * TOWY_RATE));
  });

  it("leaves insurance-covered dollars alone: full coverage has no member cut, and carrier jobs pay a flat dispatch fee instead", () => {
    const member = splitBill(200, "full", "member");
    assert.equal(member.covered, 200);
    assert.equal(member.driverPays, 0);
    assert.equal(member.towyFee, 0);
    assert.equal(member.dispatchFee, 0);
    assert.equal(member.operatorReceives, 200);

    const insurer = splitBill(200, "full", "insurer");
    assert.equal(insurer.covered, 200);
    assert.equal(insurer.driverPays, 0);
    assert.equal(insurer.towyFee, 0);
    assert.equal(insurer.dispatchFee, DISPATCH_FEE);
    assert.equal(insurer.operatorReceives, 200);

    const seed = splitBill(200, "roadside", "seed");
    assert.equal(seed.towyFee, 0);
    assert.equal(seed.dispatchFee, DISPATCH_FEE);
    assert.equal(seed.operatorReceives, 200);
  });
});

describe("pilotMonth", () => {
  it("bills the desk fee plus a dispatch fee for every pilot stop", () => {
    const month = pilotMonth();
    const stops = PILOT_STOPS_A_NIGHT * PILOT_NIGHTS;
    assert.equal(month.stops, stops);
    assert.equal(month.dispatch, stops * DISPATCH_FEE);
    assert.equal(month.desk, DESK_FEE);
    assert.equal(month.total, month.dispatch + DESK_FEE);
    assert.equal(stops, 240);
    assert.equal(month.total, 240 * 18 + 4000);
  });
});

describe("needsShop and work labels", () => {
  it("sends a tow, a flat with no spare, wrong fuel, or an EV jump to a shop", () => {
    assert.equal(needsShop(jobWith({ help: "tow" })), true);
    assert.equal(needsShop(jobWith({ help: "tire", situation: baseSituation({ spare: false }) })), true);
    assert.equal(needsShop(jobWith({ help: "fuel", situation: baseSituation({ wrongFuel: true }) })), true);
    assert.equal(needsShop(jobWith({ help: "jump", vehicle: baseVehicle({ ev: true }) })), true);
  });

  it("keeps ordinary roadside help on the shoulder", () => {
    for (const help of ["tire", "jump", "lockout", "fuel"] as const) {
      assert.equal(needsShop(jobWith({ help })), false);
    }
    for (const help of ["bulb", "oil", "wipers", "crack"] as const) {
      assert.equal(atCurb(help), true);
      assert.equal(needsShop(jobWith({ help })), false);
    }
    assert.equal(workLabel(jobWith({ help: "tire" })), "Spare swap");
    assert.equal(workLabel(jobWith({ help: "tow" })), "Tow");
    assert.equal(helpLabel("tire"), "Flat tire");
  });
});

describe("equipment and scene recommendations", () => {
  it("recommends a flatbed for EVs, cars that will not roll, AWD that will not start, or off-road recoveries", () => {
    const rolling = { starts: true, rolls: true, position: "shoulder" as const };
    assert.equal(recommendEquipment(baseVehicle({ ev: true }), rolling), "flatbed");
    assert.equal(recommendEquipment(baseVehicle(), { starts: true, rolls: false, position: "shoulder" }), "flatbed");
    assert.equal(
      recommendEquipment(baseVehicle({ drivetrain: "AWD" }), { starts: false, rolls: true, position: "shoulder" }),
      "flatbed",
    );
    assert.equal(recommendEquipment(baseVehicle(), { starts: true, rolls: true, position: "offroad" }), "flatbed");
    assert.equal(recommendEquipment(baseVehicle(), rolling), "wheel-lift");
  });

  it("recommends a winch only in a ditch or off the roadway", () => {
    assert.equal(recommendWinch("ditch"), true);
    assert.equal(recommendWinch("offroad"), true);
    assert.equal(recommendWinch("shoulder"), false);
    assert.equal(recommendWinch("lane"), false);
  });

  it("asks for an officer in a live lane, or in the median or on a ramp when traffic is not light", () => {
    assert.equal(recommendPolice("lane", "right", "light"), true);
    assert.equal(recommendPolice("shoulder", "median", "moderate"), true);
    assert.equal(recommendPolice("shoulder", "ramp", "heavy"), true);
    assert.equal(recommendPolice("shoulder", "right", "heavy"), false);
    assert.equal(recommendPolice("shoulder", "median", "light"), false);
  });
});

describe("quotes and ETAs from buildCalls", () => {
  it("builds quotes whose line items sum to the total and whose split matches splitBill", () => {
    const job = jobWith({ help: "tow", coverage: "roadside", source: "member" });
    const quotes = buildCalls(job).filter((call) => call.quote).map((call) => call.quote!);
    assert.ok(quotes.length >= 1);
    for (const quote of quotes) {
      const sum = round2(
        quote.hook +
          quote.mileage +
          quote.equipmentFee +
          quote.winchFee +
          quote.afterHours +
          quote.policeWait +
          quote.dropFee,
      );
      assert.equal(quote.total, sum);
      assert.equal(quote.afterHours, AFTER_HOURS_FEE);
      const money = splitBill(quote.total, job.coverage, job.source);
      assert.deepEqual(
        {
          covered: quote.covered,
          driverPays: quote.driverPays,
          towyFee: quote.towyFee,
          dispatchFee: quote.dispatchFee,
          operatorReceives: quote.operatorReceives,
        },
        money,
      );
      assert.ok(quote.etaMin >= 12 && quote.etaMin <= 75);
    }
  });

  it("drops the after-hours fee for driveway work and charges a carrier the per-stop dispatch fee instead of a 6% cut", () => {
    const curb = buildCalls(jobWith({ help: "oil", coverage: "none", source: "member" }))
      .map((call) => call.quote)
      .find((quote) => quote);
    assert.ok(curb);
    assert.equal(curb.afterHours, 0);
    assert.equal(curb.dispatchFee, 0);

    const insurer = buildCalls(jobWith({ help: "tow", coverage: "full", source: "insurer" }))
      .map((call) => call.quote)
      .find((quote) => quote);
    assert.ok(insurer);
    assert.equal(insurer.towyFee, 0);
    assert.equal(insurer.dispatchFee, DISPATCH_FEE);
    assert.equal(insurer.operatorReceives, insurer.total);
    assert.equal(insurer.covered, insurer.total);
  });

  it("includes a drop-shop mileage fee in the total when a shop drop is set", () => {
    const job = jobWith({
      help: "tow",
      drop: {
        shop: {
          id: "test-shop",
          name: "Test Tires",
          address: "1 Main",
          lat: 39.96,
          lng: -83.0,
          rating: 4.5,
          reviews: 10,
          kind: "tire",
        },
        miles: 4,
      },
    });
    const quote = buildCalls(job).find((call) => call.quote)?.quote;
    assert.ok(quote);
    assert.equal(quote.dropMiles, 4);
    assert.equal(quote.dropName, "Test Tires");
    assert.equal(quote.dropFee, round2(4 * (quote.mileage / quote.miles)));
    assert.ok(quote.dropFee > 0);
    assert.equal(
      quote.total,
      round2(
        quote.hook +
          quote.mileage +
          quote.equipmentFee +
          quote.winchFee +
          quote.afterHours +
          quote.policeWait +
          quote.dropFee,
      ),
    );
  });

  it("skips a shop with no winch when the job needs one, and can pin a first-call shop at the front", () => {
    const ditch = jobWith({
      help: "tow",
      situation: baseSituation({ position: "ditch", winch: true, equipment: "flatbed" }),
    });
    const noWinch = buildCalls(ditch, "outerbelt");
    assert.equal(noWinch[0]?.companyId, "outerbelt");
    assert.equal(noWinch[0]?.available, false);
    assert.equal(noWinch[0]?.decline, "No winch on tonight's truck.");
    assert.ok(noWinch.some((call) => call.quote));

    const first = buildCalls(jobWith(), "olentangy");
    assert.equal(first[0]?.companyId, "olentangy");
  });
});

describe("halfwayUpdate", () => {
  it("holds the quoted price and cuts the ETA roughly in half, with a 6-minute floor", () => {
    const quote = buildCalls(jobWith({ locationId: "us33-12" })).find((call) => call.quote)?.quote;
    assert.ok(quote);
    const job = jobWith({
      locationId: "us33-12",
      selectedCompanyId: quote.companyId,
      calls: [{ companyId: quote.companyId, available: true, quote }],
      live: { etaMin: quote.etaMin, total: quote.total, note: "Rolling" },
    });
    const update = halfwayUpdate(job);
    assert.equal(update.total, quote.total);
    assert.equal(update.etaMin, Math.max(6, Math.round(quote.etaMin * 0.48)));
    assert.match(update.note, /Price held/);
    assert.doesNotMatch(update.note, /Heavy traffic/);
  });

  it("adds three minutes in heavy traffic but still holds the price", () => {
    const quote = buildCalls(jobWith({ locationId: "i70-108" })).find((call) => call.quote)?.quote;
    assert.ok(quote);
    const update = halfwayUpdate(
      jobWith({
        locationId: "i70-108",
        selectedCompanyId: quote.companyId,
        calls: [{ companyId: quote.companyId, available: true, quote }],
        live: { etaMin: 20, total: quote.total, note: "Rolling" },
      }),
    );
    assert.equal(update.total, quote.total);
    assert.equal(update.etaMin, Math.max(6, Math.round(20 * 0.48) + 3));
    assert.match(update.note, /Heavy traffic added a few minutes\. Price held/);
  });
});

describe("helpers", () => {
  it("computes a 0-mile distance for the same point and is symmetric", () => {
    assert.ok(Math.abs(milesBetween(39.9612, -82.999, 39.9612, -82.999)) < 1e-9);
    const a = milesBetween(39.9684, -82.9375, 40.0992, -83.1095);
    const b = milesBetween(40.0992, -83.1095, 39.9684, -82.9375);
    assert.equal(round2(a), round2(b));
    assert.ok(a > 8 && a < 20);
  });

  it("formats money and validates a phone and a vehicle", () => {
    assert.equal(usd(12.5), "$12.50");
    assert.equal(round2(1.234), 1.23);
    assert.equal(round2(1.235), 1.24);
    assert.equal(carLabel(baseVehicle()), "2019 Honda Civic");
    assert.equal(phoneOk("(614) 555-0198"), true);
    assert.equal(phoneOk("555-0198"), false);
    assert.equal(vehicleOk(baseVehicle()), true);
    assert.equal(vehicleOk(baseVehicle({ make: "  " })), false);
  });
});
