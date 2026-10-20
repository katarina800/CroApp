/**
 * utils/planEngine.ts — gradnja dana za plan putovanja.
 *
 * Čista logika bez React-a i bez mreže, pa se može provjeriti testovima.
 * (Prije je živjela u PlanMyDayModal.tsx, usred ekrana od 4000 redaka.)
 */

// ---------------------------------------------------------------------------
// Tipovi
// ---------------------------------------------------------------------------
export type PlanStyle = "opusteno" | "kulturno" | "avantura";
export type TransportType = "auto" | "javni" | "pjesice" | "bicikl";
export type CompanionType = "solo" | "partner" | "prijatelji" | "obitelj";
export type TravelMode = "walking" | "bicycling" | "driving" | "transit";

export interface VenueItem {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
}

export interface DayActivity {
  id: string;
  time: string;
  venueName: string;
  venueType: string;
  /** Minute puta od prethodne postaje; 0 za prvu postaju u danu. */
  travelMinutes: number;
  venue: VenueItem | null;
  type: string;
  duration: number;
  cost: string;
  description: string;
  order: number;
}

// ---------------------------------------------------------------------------
// Pomoćne funkcije
// ---------------------------------------------------------------------------
export function haversineKm(
  a1: number,
  o1: number,
  a2: number,
  o2: number,
): number {
  const R = 6371;
  const dA = ((a2 - a1) * Math.PI) / 180;
  const dO = ((o2 - o1) * Math.PI) / 180;
  const a =
    Math.sin(dA / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) *
      Math.cos((a2 * Math.PI) / 180) *
      Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Izbor "Prijevoz" iz forme → način putovanja; null = nije odabrano. */
export function modeFromTransport(tr: TransportType | null): TravelMode | null {
  switch (tr) {
    case "auto":
      return "driving";
    case "javni":
      return "transit";
    case "pjesice":
      return "walking";
    case "bicikl":
      return "bicycling";
    default:
      return null;
  }
}

/** Kad korisnik nije odabrao prijevoz: pješice do ~1,5 km, inače vozilom. */
export function suggestMode(km: number | null): TravelMode {
  return km === null || km <= 1.5 ? "walking" : "driving";
}

/**
 * Grubo vrijeme putovanja iz zračne udaljenosti. Nije ruta, pa je uvijek
 * prikazano s "~": cesta je dulja od pravca, a javni prijevoz ima čekanje.
 */
export function estimateMinutes(km: number, mode: TravelMode): number {
  let min: number;
  switch (mode) {
    case "walking":
      min = ((km * 1.3) / 5) * 60;
      break;
    case "bicycling":
      min = ((km * 1.3) / 15) * 60;
      break;
    case "driving":
      min = 3 + ((km * 1.4) / 35) * 60;
      break;
    case "transit":
      min = 8 + ((km * 1.4) / 20) * 60;
      break;
  }
  return Math.max(1, Math.round(min));
}

// Dan traje 08:00–23:00. Ranija verzija je imala fiksnu listu od 11 termina i
// svaki je bio vezan uz točno jednu kategoriju; ako u okolici te kategorije
// nije bilo, termin je ispadao — pa je plan za grad bez plaže/muzeja znao
// imati samo dva večernja stajališta i prazan ostatak dana.
//
// Sada se dan gradi kao vremenska crta: tri sidra (doručak, ručak, večera) i
// između njih se slobodni blokovi popunjavaju iz kataloga aktivnosti. Katalog
// je težinski ovisan o stilu putovanja (opušteno / kulturno / avantura), a
// izbor sljedećeg stajališta uzima u obzir udaljenost od prethodnog, pa se
// dan ne razbacuje po cijelom gradu.
const DAY_START_MINUTES = 8 * 60;
const DAY_END_MINUTES = 23 * 60;
// Više od ovoga nitko ne stigne odraditi u jednom danu.
const MAX_STOPS_PER_DAY = 14;

export interface ActivityTemplate {
  type: string;
  duration: number;
  cost: string;
  /** Najraniji smisleni početak. */
  earliest: number;
  /** Najkasniji smisleni početak. */
  latest: number;
  /** Koliko puta u danu se kategorija smije ponoviti (uvijek drugo mjesto). */
  maxPerDay: number;
  /**
   * Trajanje se smije skratiti ako do sljedećeg obroka / kraja dana nema
   * mjesta za puno trajanje (plaža, park, izlazak — nemaju fiksni termin).
   * Kino, kazalište i muzej nemaju tu slobodu: predstava traje koliko traje.
   */
  flexible?: boolean;
  descriptionKey: string;
  fallback: string;
  /** 0 = kategorija se za taj stil ne nudi. */
  weights: Record<PlanStyle, number>;
}
/** Skraćena aktivnost ispod ovoga nema smisla. */
const MIN_FLEX_DURATION = 45;
/** Rezerva između kraja aktivnosti i najkasnijeg termina obroka. */
const MEAL_TRAVEL_SLACK = 15;

// Opisi su namjerno vremenski neutralni ("Šetnja parkom", a ne "šetnja nakon
// ručka") — raspored je dinamičan, pa bi svaki opis vezan uz doba dana prije
// ili kasnije proturječio vremenu uz koje stoji.
export const ACTIVITY_CATALOG: ActivityTemplate[] = [
  {
    type: "landmark",
    duration: 50,
    cost: "0-5",
    earliest: 8 * 60,
    latest: 19 * 60,
    maxPerDay: 3,
    descriptionKey: "plan.actLandmark",
    fallback: "Razgledavanje znamenitosti",
    weights: { kulturno: 5, opusteno: 3, avantura: 3 },
  },
  {
    type: "museum",
    duration: 75,
    cost: "8-15",
    earliest: 9 * 60,
    latest: 16 * 60 + 30,
    maxPerDay: 2,
    descriptionKey: "plan.actMuseum",
    fallback: "Obilazak muzeja",
    weights: { kulturno: 5, opusteno: 2, avantura: 1 },
  },
  {
    type: "market",
    duration: 40,
    cost: "0-10",
    earliest: 8 * 60,
    latest: 13 * 60 + 30,
    maxPerDay: 1,
    descriptionKey: "plan.actMarket",
    fallback: "Obilazak tržnice",
    weights: { kulturno: 4, opusteno: 3, avantura: 2 },
  },
  {
    type: "park",
    duration: 45,
    cost: "0",
    earliest: 8 * 60,
    latest: 20 * 60,
    maxPerDay: 2,
    flexible: true,
    descriptionKey: "plan.actPark",
    fallback: "Šetnja parkom",
    weights: { kulturno: 3, opusteno: 5, avantura: 2 },
  },
  {
    type: "cafe",
    duration: 30,
    cost: "4-8",
    earliest: 9 * 60,
    latest: 20 * 60,
    maxPerDay: 2,
    descriptionKey: "plan.actCafe",
    fallback: "Kava i predah",
    weights: { kulturno: 3, opusteno: 5, avantura: 2 },
  },
  {
    type: "beach",
    duration: 120,
    cost: "0-10",
    earliest: 9 * 60,
    latest: 18 * 60,
    maxPerDay: 1,
    flexible: true,
    descriptionKey: "plan.actBeach",
    fallback: "Odmor na plaži",
    weights: { kulturno: 2, opusteno: 5, avantura: 3 },
  },
  {
    type: "spa",
    duration: 90,
    cost: "20-40",
    earliest: 10 * 60,
    latest: 20 * 60,
    maxPerDay: 1,
    flexible: true,
    descriptionKey: "plan.actSpa",
    fallback: "Spa i wellness",
    weights: { kulturno: 1, opusteno: 5, avantura: 1 },
  },
  {
    type: "mountain",
    duration: 180,
    cost: "0-10",
    earliest: 8 * 60,
    latest: 14 * 60,
    maxPerDay: 1,
    flexible: true,
    descriptionKey: "plan.actMountain",
    fallback: "Planinarski izlet",
    weights: { kulturno: 1, opusteno: 2, avantura: 5 },
  },
  {
    type: "nationalPark",
    duration: 210,
    cost: "10-30",
    earliest: 8 * 60,
    latest: 13 * 60,
    maxPerDay: 1,
    flexible: true,
    descriptionKey: "plan.actNationalPark",
    fallback: "Nacionalni park",
    weights: { kulturno: 2, opusteno: 3, avantura: 5 },
  },
  {
    type: "cave",
    duration: 90,
    cost: "8-20",
    earliest: 9 * 60,
    latest: 16 * 60,
    maxPerDay: 1,
    flexible: true,
    descriptionKey: "plan.actCave",
    fallback: "Obilazak špilje",
    weights: { kulturno: 3, opusteno: 1, avantura: 5 },
  },
  {
    type: "paintball",
    duration: 90,
    cost: "15-30",
    earliest: 9 * 60,
    latest: 18 * 60,
    maxPerDay: 1,
    descriptionKey: "plan.actPaintball",
    fallback: "Paintball",
    weights: { kulturno: 0, opusteno: 1, avantura: 5 },
  },
  {
    type: "escapeRoom",
    duration: 60,
    cost: "15-25",
    earliest: 10 * 60,
    latest: 21 * 60,
    maxPerDay: 1,
    descriptionKey: "plan.actEscapeRoom",
    fallback: "Escape room",
    weights: { kulturno: 2, opusteno: 2, avantura: 5 },
  },
  {
    type: "theater",
    duration: 120,
    cost: "10-30",
    earliest: 19 * 60,
    latest: 20 * 60 + 45,
    maxPerDay: 1,
    descriptionKey: "plan.actTheater",
    fallback: "Predstava u kazalištu",
    weights: { kulturno: 5, opusteno: 3, avantura: 1 },
  },
  {
    // Kino je večernji program: dok je bilo dostupno od 16h, dvosatna
    // projekcija znala je pojesti cijelo poslijepodne razgledavanja.
    type: "cinema",
    duration: 120,
    cost: "6-12",
    earliest: 17 * 60,
    latest: 20 * 60 + 45,
    maxPerDay: 1,
    descriptionKey: "plan.actCinema",
    fallback: "Kino",
    weights: { kulturno: 2, opusteno: 4, avantura: 2 },
  },
  {
    type: "club",
    duration: 120,
    cost: "15-35",
    earliest: 20 * 60 + 45,
    latest: 21 * 60 + 45,
    maxPerDay: 1,
    flexible: true,
    descriptionKey: "plan.actClub",
    fallback: "Noćni izlazak",
    weights: { kulturno: 2, opusteno: 3, avantura: 4 },
  },
];

/** Procjena vremena putovanja unutar grada iz zračne udaljenosti. */
function travelMinutesBetween(
  from: { latitude: number; longitude: number } | null,
  to: { latitude: number; longitude: number } | null,
): number {
  if (!from || !to) return 10;
  const km = haversineKm(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  // ~5 min/km (pješice/kratka vožnja) + 5 min na parkiranje/orijentaciju.
  return Math.min(60, Math.max(5, Math.round(5 + km * 5)));
}

/**
 * Odakle plan računa udaljenosti. Spontani plan ("zatekao sam se u gradu")
 * kreće od korisnika, pa je prva postaja ona koja je NJEMU blizu — ne ona
 * koja je blizu središta grada. Ako je korisnik daleko od odredišta (plan za
 * drugi grad), polazi se od središta odredišta.
 */
export function planStartFor(
  spontaneous: boolean,
  user: { latitude: number; longitude: number } | null,
  geocoded: { latitude: number; longitude: number } | null,
): { latitude: number; longitude: number } | null {
  if (!geocoded) return user && spontaneous ? user : null;
  if (
    spontaneous &&
    user &&
    haversineKm(
      user.latitude,
      user.longitude,
      geocoded.latitude,
      geocoded.longitude,
    ) <= 30
  ) {
    return { latitude: user.latitude, longitude: user.longitude };
  }
  return { latitude: geocoded.latitude, longitude: geocoded.longitude };
}

export function getTimeBasedActivities(
  allVenues: Record<string, VenueItem[]>,
  dayOffset: number = 0,
  fallbackCoords?: { latitude: number; longitude: number } | null,
  t?: (key: string, opts?: any) => string,
  options?: {
    spontaneous?: boolean;
    nowMinutes?: number;
    style?: PlanStyle;
    dayCount?: number;
  },
): DayActivity[] {
  const tr = (key: string, fallback: string) => (t ? t(key) : fallback);
  const style: PlanStyle = options?.style ?? "kulturno";
  const dayCount = Math.max(1, options?.dayCount ?? 1);

  const startMinutes = options?.spontaneous
    ? // Spontani plan počinje "sad", zaokruženo na sljedećih 15 minuta.
      Math.min(
        DAY_END_MINUTES,
        Math.max(
          DAY_START_MINUTES,
          Math.ceil((options.nowMinutes ?? DAY_START_MINUTES) / 15) * 15,
        ),
      )
    : DAY_START_MINUTES;

  // Svako mjesto se u danu koristi samo jednom.
  const usedVenueNames = new Set<string>();

  // Kod višednevnog plana svaki dan dobiva svoj podskup mjesta, inače bi svi
  // dani izgledali identično (isti muzej, isti park, ista plaža).
  const preferredForToday = (type: string, venue: VenueItem): boolean => {
    const list = allVenues[type] || [];
    if (list.length === 0) return true;
    const idx = list.findIndex((v) => v.name === venue.name);
    if (idx < 0) return true;
    const groups = Math.min(list.length, dayCount);
    return idx % groups === dayOffset % groups;
  };

  /** Najbolje slobodno mjesto tražene kategorije — blizu, i "za današnji dan". */
  const pickVenue = (
    type: string,
    from: { latitude: number; longitude: number } | null,
  ): { venue: VenueItem; travel: number } | null => {
    const list = allVenues[type] || [];
    let best: { venue: VenueItem; travel: number; score: number } | null = null;
    for (const v of list) {
      if (usedVenueNames.has(v.name)) continue;
      const travel = travelMinutesBetween(from, v);
      const score = -travel + (preferredForToday(type, v) ? 30 : 0);
      if (!best || score > best.score) best = { venue: v, travel, score };
    }
    return best ? { venue: best.venue, travel: best.travel } : null;
  };

  // --- Sidra dana: obroci -------------------------------------------------
  // Sidro se u plan ubacuje kad dođe njegovo vrijeme; ako mu vrijeme prođe
  // (spontani plan u 20h nema doručak ni ručak), jednostavno otpada.
  interface Anchor {
    type: string;
    duration: number;
    cost: string;
    preferred: number;
    latest: number;
    descriptionKey: string;
    fallback: string;
  }
  const anchors: Anchor[] = [
    {
      type: "cafe",
      duration: 45,
      cost: "5-10",
      preferred: 8 * 60,
      latest: 10 * 60 + 30,
      descriptionKey: "plan.schedBreakfast",
      fallback: "Doručak",
    },
    {
      type: "restaurant",
      duration: 60,
      cost: "12-22",
      preferred: 12 * 60 + 30,
      latest: 15 * 60,
      descriptionKey: "plan.schedLunch",
      fallback: "Ručak",
    },
    {
      type: "restaurant",
      duration: 75,
      cost: "20-40",
      preferred: 19 * 60,
      latest: 21 * 60,
      descriptionKey: "plan.schedDinner",
      fallback: "Večera",
    },
  ].filter((a) => a.latest >= startMinutes);

  // --- Gradnja vremenske crte --------------------------------------------
  interface PlacedStop {
    startAt: number;
    duration: number;
    cost: string;
    type: string;
    venue: VenueItem;
    description: string;
    /** Minute puta od prethodne postaje; 0 za prvu. */
    travelMinutes: number;
  }
  const placed: PlacedStop[] = [];
  const usedCount: Record<string, number> = {};

  let cursor = startMinutes;
  let position: { latitude: number; longitude: number } | null =
    fallbackCoords ?? null;
  let anchorIdx = 0;

  const place = (
    startAt: number,
    tpl: {
      type: string;
      duration: number;
      cost: string;
      descriptionKey: string;
      fallback: string;
    },
    venue: VenueItem,
    // Minute puta od prethodne postaje. Plan ih je oduvijek RAČUNAO (mjesta
    // se biraju po blizini), ali ih nije nigdje pokazivao — pa korisnik nije
    // imao po čemu prosuditi je li plan dobar ili nasumičan.
    travelMinutes = 0,
  ) => {
    usedVenueNames.add(venue.name);
    usedCount[tpl.type] = (usedCount[tpl.type] || 0) + 1;
    placed.push({
      startAt,
      duration: tpl.duration,
      cost: tpl.cost,
      type: tpl.type,
      venue,
      description: tr(tpl.descriptionKey, tpl.fallback),
      travelMinutes,
    });
    cursor = startAt + tpl.duration;
    position = venue;
  };

  while (cursor < DAY_END_MINUTES && placed.length < MAX_STOPS_PER_DAY) {
    // 1) Je li na redu obrok?
    const anchor: Anchor | undefined = anchors[anchorIdx];
    if (anchor && cursor > anchor.latest) {
      anchorIdx++;
      continue;
    }
    if (anchor && cursor + 20 >= anchor.preferred) {
      const found = pickVenue(anchor.type, position);
      anchorIdx++;
      if (found) {
        const startAt = Math.max(cursor + found.travel, anchor.preferred);
        if (
          startAt <= anchor.latest &&
          startAt + anchor.duration <= DAY_END_MINUTES
        ) {
          place(startAt, anchor, found.venue, found.travel);
          continue;
        }
      }
      continue;
    }

    // 2) Popuni slobodni blok do sljedećeg obroka (ili do kraja dana).
    //    Blok mora završiti dovoljno prije najkasnijeg termina obroka da se do
    //    restorana stigne doći — inače bi dugačka aktivnost (npr. kazalište
    //    19:00–21:00) pojela večeru, koja bi onda ispala iz plana.
    const blockEnd = anchor
      ? Math.min(anchor.latest - MEAL_TRAVEL_SLACK, DAY_END_MINUTES)
      : DAY_END_MINUTES;
    // Broj mjesta koja treba ostaviti za preostale obroke — bez ovoga bi
    // gornja granica broja stajališta znala pojesti večeru.
    const reserved = anchors.length - anchorIdx;
    if (placed.length + reserved >= MAX_STOPS_PER_DAY) {
      if (anchor) {
        cursor = Math.max(cursor, anchor.preferred);
        continue;
      }
      break;
    }

    let bestCandidate: {
      tpl: ActivityTemplate;
      venue: VenueItem;
      startAt: number;
      duration: number;
      score: number;
      travel: number;
    } | null = null;

    for (const tpl of ACTIVITY_CATALOG) {
      const weight = tpl.weights[style];
      if (weight <= 0) continue;
      if ((usedCount[tpl.type] || 0) >= tpl.maxPerDay) continue;
      const found = pickVenue(tpl.type, position);
      if (!found) continue;
      const startAt = Math.max(cursor + found.travel, tpl.earliest);
      if (startAt > tpl.latest) continue;
      // Aktivnost ne smije "pojesti" sljedeći obrok ni prijeći kraj dana.
      const room = blockEnd - startAt;
      const duration = tpl.flexible
        ? Math.min(tpl.duration, room)
        : tpl.duration;
      if (duration > room) continue;
      if (tpl.flexible && duration < Math.min(tpl.duration, MIN_FLEX_DURATION))
        continue;
      // Kazna za čekanje: ako termin počinje tek za sat vremena, dan stoji —
      // bolje je uzeti nešto što može odmah, pa ovo kasnije.
      const wait = startAt - (cursor + found.travel);
      const score =
        weight * 20 -
        found.travel -
        wait * 0.8 -
        (usedCount[tpl.type] || 0) * 15 -
        // Skraćena aktivnost je slabija od pune.
        (tpl.duration - duration) * 0.2;
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = {
          tpl,
          venue: found.venue,
          startAt,
          duration,
          score,
          travel: found.travel,
        };
      }
    }

    if (bestCandidate) {
      place(
        bestCandidate.startAt,
        { ...bestCandidate.tpl, duration: bestCandidate.duration },
        bestCandidate.venue,
        bestCandidate.travel,
      );
      continue;
    }

    // 3) Ništa ne stane u blok — preskoči na sljedeći obrok ili završi dan.
    if (anchor) {
      cursor = Math.max(cursor, anchor.preferred);
      // Ako je i nakon pomaka blok prazan, sidro će se obraditi u sljedećem
      // krugu; ako ni tada ne uspije, anchorIdx se pomiče i petlja ide dalje.
      if (cursor >= DAY_END_MINUTES) break;
      continue;
    }
    break;
  }

  placed.sort((a, b) => a.startAt - b.startAt);

  return placed.map((stop, idx) => {
    const h = Math.floor(stop.startAt / 60);
    const m = stop.startAt % 60;
    return {
      id: `act_${idx}`,
      time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      venueName: stop.venue.name,
      venueType: stop.type,
      venue: stop.venue,
      type: stop.type,
      duration: stop.duration,
      cost: stop.cost,
      description: stop.description,
      // Prva postaja nema od čega putovati, pa se vrijeme puta ne prikazuje.
      travelMinutes: idx === 0 ? 0 : stop.travelMinutes,
      order: idx,
    };
  });
}
