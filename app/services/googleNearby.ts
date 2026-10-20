// app/services/googleNearby.ts
//
// Mjesta oko točke s Googlea (Places API (New)), razvrstana u naše kategorije i
// očišćena od onoga što u njima nije (saloni u "klubovima", hoteli u
// "kazalištima", apoteke u "toplicama" …). Dijele ga glavna karta i plan
// putovanja, a rezultati se pamte u memoriji pa se isti upit ne ponavlja.

import { nearbySearchNew } from "./googlePlacesNew";
import { nameMatchesDenylist, Place } from "./locationService";

function haversineKm(a1: number, o1: number, a2: number, o2: number) {
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

// Google Places Nearby Search — vraća sve tipove odjednom
// Nazivi tipova iz Places API (New). Svi tipovi jedne kategorije idu u JEDAN
// upit (includedTypes), a ne po jedan upit za svaki tip kao prije.
export const GOOGLE_TYPE_MAP: Partial<Record<Place["type"], string[]>> = {
  restaurant: ["restaurant", "fast_food_restaurant", "meal_takeaway"],
  cafe: ["cafe", "coffee_shop"],
  club: ["night_club"],
  cinema: ["movie_theater"],
  museum: ["museum"],
  // theater namjerno izostavljen — Google Places vraća hotele s "theater room"
  spa: ["spa"],
  park: ["park"],
  accommodation: ["lodging"],
  // "place_of_worship" nije dopušten u upitu (samo u odgovoru): Google je cijeli
  // upit odbijao s HTTP 400, pa se nijedna znamenitost nikad nije učitala.
  landmark: ["tourist_attraction", "historical_landmark", "church"],
  opg: ["farm"],
};

/** Rezultati Googleovih upita ostaju u memoriji: isti upit se ne ponavlja (brže i jeftinije). */
const GOOGLE_CACHE_MS = 20 * 60 * 1000;
const googleNearbyCache = new Map<string, { at: number; places: Place[] }>();

export async function fetchGoogleNearby(
  key: string,
  latitude: number,
  longitude: number,
  radiusM: number,
  types: string[],
  // lite: samo osnovna polja (bez radnog vremena) — jeftinije; za plan putovanja.
  lite = false,
): Promise<Place[]> {
  if (!key) return [];
  const radiusCapped = Math.min(radiusM, 50000);

  const promises: Promise<Place[]>[] = [];

  for (const type of types) {
    const googleTypes = GOOGLE_TYPE_MAP[type as Place["type"]];
    if (!googleTypes) continue;

    {
      promises.push(
        (async (): Promise<Place[]> => {
          try {
            const cacheKey = `${lite ? "lite" : "full"}|${type}|${latitude.toFixed(3)},${longitude.toFixed(3)}|${radiusCapped}`;
            const hit = googleNearbyCache.get(cacheKey);
            let found: Place[];
            if (hit && Date.now() - hit.at < GOOGLE_CACHE_MS) {
              found = hit.places;
            } else {
              const res = await nearbySearchNew({
                key,
                latitude,
                longitude,
                radiusM: radiusCapped,
                includedTypes: googleTypes,
                lite,
              });
              // Neuspjeh se ne sprema: sljedeći pokušaj ide na mrežu.
              if (res.error) return [];

              // Google vraća i trajno zatvorene (business_status
              // CLOSED_PERMANENTLY) i privremeno nedostupne lokale; takva
              // mjesta ne smiju završiti na karti kao svako drugo.
              found = res.places
                .filter(
                  (p) =>
                    !p.businessStatus || p.businessStatus === "OPERATIONAL",
                )
                .map((p): Place => ({
                  id: `google_${p.id}`,
                  name: p.name,
                  latitude: p.latitude,
                  longitude: p.longitude,
                  type: type as Place["type"],
                  rating: p.rating,
                  address: p.address,
                  distance: haversineKm(
                    latitude,
                    longitude,
                    p.latitude,
                    p.longitude,
                  ),
                  openNow: p.openNow,
                  // Zapisano radno vrijeme omogućuje pouzdan filter po doba
                  // dana (prije je postojalo samo "otvoreno ovog trena").
                  openingHours: p.openingHours,
                }));
              googleNearbyCache.set(cacheKey, {
                at: Date.now(),
                places: found,
              });
            }
            let results: Place[] = [...found];

            // FILTER ZA THEATER
            if (type === "theater") {
              const forbidden = [
                "hotel",
                "hostel",
                "apartment",
                "soba",
                "rooms",
                "villa",
                "inn",
                "motel",
                "resort",
                "lodging",
                "accommodation",
              ];
              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                return !nameMatchesDenylist(n, forbidden);
              });
            }

            // FILTER ZA SPA — blokiraj sve što nije stvarna toplica/terme/wellness
            if (type === "spa") {
              const SPA_GOOGLE_BLOCK = [
                "ambulanta",
                "liječnik",
                "doktor",
                "medicina",
                "medical",
                "obiteljske",
                "dežurna",
                "fizioterapi",
                "physio",
                "rehabilitaci",
                "beauty",
                "kozmetik",
                "kozmetičk",
                "estetik",
                "estetica",
                "estetska",
                "salon",
                "nail",
                "manikur",
                "pedikur",
                "fitness",
                "gym",
                "teretana",
                "crossfit",
                "osobni trening",
                "treninzi",
                "centar kulture",
                "kulture tijela",
                "njegu tijela",
                "njegu",
                "sport i njegu",
                "sport centar",
                "tensegrity",
                "wellar",
                "studio",
                "apartman",
                "apartment",
                "hotel",
                "hostel",
                "nekretnin",
                "obrt",
                "d.o.o",
                "ljekarnica",
                "apoteka",
              ];
              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                return !nameMatchesDenylist(n, SPA_GOOGLE_BLOCK);
              });
            }

            // FILTER ZA CLUB — blokiraj sve što nije stvarni noćni klub
            if (type === "club") {
              const CLUB_BLOCK = [
                // saloni za pse i kućne ljubimce
                "salon za pse",
                "dog salon",
                "pet salon",
                "grooming",
                "ljubimac",
                "kućni ljubimac",
                "njega pasa",
                "uređivanje pasa",
                "šišanje pasa",
                "frizerski salon",
                "frizersk",
                "frizer",
                "hair salon",
                "hair studio",
                "brijačnica",
                "barber",
                // automati, gaming
                "automat",
                "gaming",
                "slot",
                "tombola",
                // kladionice i kockarnice
                "kladionica",
                "sportska kladionica",
                "mozzart",
                "winbet",
                "superbet",
                "lvbet",
                "admiral",
                "casino",
                "kockarnica",
                "bet",
                "betting",
                // beauty i wellness koji nisu klubovi
                "kozmetik",
                "beauty",
                "estetik",
                "nail",
                "manikur",
                "pedikur",
                "spa",
                "wellness",
                "masaž",
                "tattoo",
                "piercing",
                // fitness koji nisu klubovi
                "fitness",
                "gym",
                "teretana",
                "crossfit",
                // ostalo što nije klub
                "hotel",
                "hostel",
                "apartman",
                "smještaj",
                "restoran",
                "kafić",
                "trgovin",
                "shop",
                "prodavao",
                "obrt",
                "d.o.o",
                "nekretnin",
                "auto",
                "servis",
                "pranje",
              ];

              const CLUB_WHITELIST = [
                "nightclub",
                "night club",
                "noćni klub",
                "disco",
                "discotheque",
                "disko",
                "club",
                "klub",
                "lounge",
                "bar",
                "pub",
              ];

              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                // Blokira po denylist
                if (nameMatchesDenylist(n, CLUB_BLOCK)) return false;
                return true;
              });
            }

            // FILTER ZA OPG — blokiraj smještaj i sve što nije farma/OPG
            if (type === "opg") {
              const OPG_KEYWORDS = [
                "opg",
                "farma",
                "farm",
                "pčelar",
                "voćar",
                "vinar",
                "maslin",
                "seljack",
                "poljoprivred",
              ];
              const OPG_BLOCK = [
                "hotel",
                "hostel",
                "apartman",
                "apartment",
                "apartments",
                "soba",
                "sobe",
                "rooms",
                "room",
                "guest house",
                "guest",
                "guesthouse",
                "prenočište",
                "smještaj",
                "accommodation",
                "lodging",
                "villa",
                "vila",
                "resort",
                "inn",
                "motel",
                "studio",
                "suite",
                "bed",
                "breakfast",
                "b&b",
                "camp",
                "glamping",
                "pansion",
                "pension",
                "osijek",
                "zagreb",
                "split",
                "rijeka", // grad = nije OPG
              ];
              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                if (nameMatchesDenylist(n, OPG_BLOCK)) return false;
                return OPG_KEYWORDS.some((kw) => n.includes(kw));
              });
            }

            // FILTER ZA CAFE — blokiraj automobile i servise
            if (type === "cafe") {
              const CAR_BRANDS = [
                "bmw",
                "audi",
                "mercedes",
                "volkswagen",
                "vw",
                "opel",
                "ford",
                "toyota",
                "renault",
                "peugeot",
                "hyundai",
                "kia",
                "škoda",
                "skoda",
                "seat",
                "fiat",
                "citroen",
                "nissan",
              ];
              const CAR_WORDS = [
                "auto",
                "servis",
                "automobil",
                "car dealer",
                "salon automobila",
              ];
              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                return (
                  !CAR_BRANDS.some((brand) => n.includes(brand)) &&
                  !CAR_WORDS.some((word) => n.includes(word))
                );
              });
            }

            // FILTER ZA LANDMARK — blokiraj smještaj, gradove, događanja
            if (type === "landmark") {
              const LANDMARK_GOOGLE_BLOCK = [
                "hotel",
                "hostel",
                "apartman",
                "apartment",
                "apartments",
                "soba",
                "sobe",
                "rooms",
                "room",
                "guest house",
                "guest",
                "guesthouse",
                "prenočište",
                "smještaj",
                "accommodation",
                "lodging",
                "villa",
                "vila",
                "resort",
                "inn",
                "motel",
                "studio",
                "suite",
                "perla",
                "waldinger",
                "advent",
                "festival",
                "sajam",
                "wine walk",
                "wine & walk",
                "winterland",
                "muzej",
                "museum",
                "arhiv",
                "osijek",
                "zagreb",
                "split",
                "rijeka",
                "varaždin",
                "dubrovnik",
                "pula",
                "zadar",
                "farm stay",
                "lacković",
                "biljski krokodil",
                "sakuntala", // ← DODANO: park s historic tagom
                "centar nekretnina", // ← DODANO
                "centar nekretnine", // ← DODANO
                "nekretnin", // ← DODANO
                "park sakuntala", // ← DODANO: alternativni naziv
              ];
              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                return !nameMatchesDenylist(n, LANDMARK_GOOGLE_BLOCK);
              });
            }

            // ← DODAJ OVDJE — CINEMA filter
            if (type === "cinema") {
              const CINEMA_BLOCK = [
                "grad ",
                "općina",
                "opcina",
                "municipality",
                "city of",
                "hotel",
                "hostel",
                "apartman",
                "apartment",
                "dvorac",
                "castle",
                "crkva",
                "church",
                "katedrala",
                "cathedral",
                "muzej",
                "museum",
                "knjižnica",
                "knjiznica",
                "library",
                "škola",
                "skola",
                "school",
                "bolnica",
                "hospital",
                "dom kulture",
                "kulturni centar",
                "kulturni dom",
                "centar za kulturu",
                "zgrada",
                "building",
                "trg",
                "square",
                "park",
                "tvrđava",
                "tvrdjava",
                "fortress",
                "palace",
                "palača",
                "palaca",
                "vila",
                "villa",
                "nekretnin",
              ];
              const CINEMA_WHITELIST = [
                "kino",
                "cinema",
                "cinestar",
                "multiplex",
                "kinoplex",
                "cinemacity",
                "kinodvor",
                "art kino",
                "filmski",
                "imax",
              ];
              results = results.filter((p: Place) => {
                const n = p.name.toLowerCase();
                if (nameMatchesDenylist(n, CINEMA_BLOCK)) return false;
                return CINEMA_WHITELIST.some((kw) => n.includes(kw));
              });
            }

            // ========== VRAĆAMO FILTRIRANE REZULTATE ==========
            return results;
          } catch {
            return [];
          }
        })(),
      );
    }
  }

  const all = await Promise.all(promises);
  return all.flat();
}
