import {
  costMid,
  estimateDayCost,
  getTimeBasedActivities,
  maxStopsFor,
  type VenueItem,
} from "../utils/planEngine";

const CENTER = { latitude: 45.555, longitude: 18.6955 };

// Po 4 mjesta svake kategorije, raspoređena oko središta (~0,3–1,2 km).
function makeVenues(): Record<string, VenueItem[]> {
  const types = [
    "restaurant",
    "cafe",
    "landmark",
    "museum",
    "market",
    "park",
    "beach",
    "spa",
    "theater",
    "cinema",
    "club",
    "paintball",
    "escapeRoom",
  ];
  const out: Record<string, VenueItem[]> = {};
  types.forEach((type, ti) => {
    out[type] = [0, 1, 2, 3].map((i) => ({
      name: `${type}-${i}`,
      latitude: CENTER.latitude + (ti - 6) * 0.0008 + i * 0.002,
      longitude: CENTER.longitude + (i - 2) * 0.003,
    }));
  });
  return out;
}

const venues = makeVenues();
const plan = (opts: Parameters<typeof getTimeBasedActivities>[4] = {}) =>
  getTimeBasedActivities(venues, 0, CENTER, undefined, opts);

describe("plan: broj postaja", () => {
  it("poštuje gornju granicu po stilu", () => {
    for (const style of ["opusteno", "kulturno", "avantura"] as const) {
      expect(plan({ style }).length).toBeLessThanOrEqual(
        maxStopsFor(style, null),
      );
    }
  });

  it("obitelj ima manje postaja od solo putnika", () => {
    expect(maxStopsFor("kulturno", "obitelj")).toBeLessThan(
      maxStopsFor("kulturno", "solo"),
    );
  });

  it("uvijek zadrži večeru čak i kad je dan pun", () => {
    const acts = plan({ style: "kulturno" });
    expect(acts.filter((a) => a.type === "restaurant").length).toBe(2);
  });

  it("nikad ne koristi isto mjesto dvaput", () => {
    const names = plan({ style: "opusteno" }).map((a) => a.venueName);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("plan: s kim putujete", () => {
  it("obitelj nema klub ni paintball i dan završava do 21h", () => {
    const acts = plan({ style: "avantura", companions: "obitelj" });
    expect(acts.some((a) => a.type === "club" || a.type === "paintball")).toBe(
      false,
    );
    const last = acts[acts.length - 1];
    const [h, m] = last.time.split(":").map(Number);
    expect(h * 60 + m + last.duration).toBeLessThanOrEqual(21 * 60);
  });

  it("prijatelji u avanturi dobivaju paintball ili escape room", () => {
    const acts = plan({ style: "avantura", companions: "prijatelji" });
    expect(
      acts.some((a) => a.type === "paintball" || a.type === "escapeRoom"),
    ).toBe(true);
  });
});

describe("plan: budžet", () => {
  const total = (budget: number | null, dayCount = 1) =>
    estimateDayCost(
      plan({ style: "kulturno", budget, dayCount, companions: "partner" }),
    );

  it("mali budžet daje jeftiniji dan od neograničenog", () => {
    expect(total(40).mid).toBeLessThan(total(null).mid);
  });

  it("dan stane u dnevni budžet (obroci uračunati)", () => {
    expect(total(120).mid).toBeLessThanOrEqual(120);
  });

  it("budžet se dijeli na dane", () => {
    expect(total(200, 4).mid).toBeLessThanOrEqual(50);
  });

  it("bez budžeta (0 / prazno) nema ograničenja", () => {
    expect(total(0).mid).toBe(total(null).mid);
  });
});

describe("plan: prijevoz", () => {
  it("pješaku ne daje etape dulje od 25 minuta (osim obroka)", () => {
    const acts = plan({ style: "kulturno", mode: "walking" });
    for (const a of acts) {
      if (a.type === "restaurant") continue;
      expect(a.travelMinutes).toBeLessThanOrEqual(25);
    }
  });
});

describe("costMid", () => {
  it("razumije raspon i jednu vrijednost", () => {
    expect(costMid("10-20")).toBe(15);
    expect(costMid("0")).toBe(0);
    expect(costMid("")).toBe(0);
  });
});
