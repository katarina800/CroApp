// app/services/locationService.ts  —  strogi OSM filteri po kategoriji

import { isOpenAt } from "@/utils/openingHours";

export interface Place {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  type:
    | "restaurant"
    | "cafe"
    | "club"
    | "beach"
    | "landmark"
    | "opg"
    | "accommodation"
    | "market"
    | "paintball"
    | "cinema"
    | "park"
    | "escapeRoom"
    | "museum"
    | "theater"
    | "mountain"
    | "nationalPark"
    | "cave"
    | "spa";
  rating?: number;
  address?: string;
  description?: string;
  distance?: number;
  phone?: string;
  website?: string;
  openingHours?: string;
  openNow?: boolean | null;
}

// Kategorija "Ostalo" za objave koje ne pripadaju ni u jednu postojeću
// kategoriju. NIJE dio placeCategories jer se te kategorije koriste i za
// pretragu mjesta na karti, a "ostalo" ne odgovara nijednoj vrsti mjesta —
// karta bi za nju vraćala prazno. Vrijedi samo za objave i za pretplatu na
// obavijesti.
export const OTHER_CATEGORY = "other";

/**
 * Boje kategorija.
 *
 * Prije su ovdje stajale boje iz zadane "flat UI" palete (#FF6B6B, #4ECDC4,
 * #F1C40F…). Na karti su bile čitljive, ali te iste boje ulaze i u sučelje —
 * u oznaku kategorije i u gumbe na listiću mjesta — pa je nad šumsko zelenom
 * pozadinom tirkiz na pola ekrana izgledao kao da je zalutao iz druge
 * aplikacije.
 *
 * Sada su nijanse raspoređene po cijelom krugu, ali prigušene i u užem
 * rasponu svjetline, pa pripadaju istoj obitelji kao ostatak sučelja.
 * Razmak među njima provjeren je u Lab prostoru: najbliži par je ΔE ≈ 14,
 * a svaka je boja ΔE ≥ 29 od pozadine — uz emoji koji svaki marker ionako
 * nosi, kategorije se i dalje razlikuju na prvi pogled.
 *
 * Kad dodaješ kategoriju, drži se raspona: zasićenost ~0.35, svjetlina
 * 0.34–0.62. Jarka boja ovdje ne ostaje samo na karti.
 */
export const placeCategories: Record<
  string,
  { icon: string; color: string; marker: string; osmTag: string }
> = {
  restaurant: {
    icon: "🍽️",
    color: "#AD6452",
    marker: "restaurant",
    osmTag: "amenity=restaurant",
  },
  cafe: {
    icon: "☕",
    color: "#825F40",
    marker: "cafe",
    osmTag: "amenity=cafe",
  },
  club: {
    icon: "🎵",
    color: "#6A4C94",
    marker: "club",
    osmTag: "amenity=nightclub",
  },
  beach: {
    icon: "🏖️",
    color: "#669CB7",
    marker: "beach",
    osmTag: "natural=beach",
  },
  landmark: {
    icon: "🏰",
    color: "#BDAB6B",
    marker: "landmark",
    osmTag: "historic=*",
  },
  opg: {
    icon: "🌾",
    color: "#95AE5B",
    marker: "opg",
    osmTag: "shop=farm",
  },
  accommodation: {
    icon: "🏨",
    color: "#C59877",
    marker: "accommodation",
    osmTag: "tourism=hotel",
  },
  market: {
    icon: "🛒",
    color: "#AD8952",
    marker: "market",
    osmTag: "amenity=marketplace",
  },
  paintball: {
    icon: "🎯",
    color: "#994853",
    marker: "paintball",
    osmTag: "sport=paintball",
  },
  cinema: {
    icon: "🎬",
    color: "#5B70AE",
    marker: "cinema",
    osmTag: "amenity=cinema",
  },
  park: {
    icon: "🌳",
    color: "#619D4D",
    marker: "park",
    osmTag: "leisure=park",
  },
  escapeRoom: {
    icon: "🔐",
    color: "#7B793D",
    marker: "escape_room",
    osmTag: "leisure=escape_game",
  },
  museum: {
    icon: "🏛️",
    color: "#9D57A8",
    marker: "museum",
    osmTag: "tourism=museum",
  },
  theater: {
    icon: "🎭",
    color: "#AE5B85",
    marker: "theatre",
    osmTag: "amenity=theatre",
  },
  mountain: {
    icon: "⛰️",
    color: "#8B9C94",
    marker: "mountain",
    osmTag: "natural=peak",
  },
  nationalPark: {
    icon: "🏞️",
    color: "#37764C",
    marker: "national_park",
    osmTag: "boundary=national_park",
  },
  cave: {
    icon: "🕳️",
    color: "#4B5F63",
    marker: "cave",
    osmTag: "natural=cave_entrance",
  },
  spa: {
    icon: "💧",
    color: "#5BAE9E",
    marker: "spa",
    osmTag: "amenity=spa",
  },
};

/**
 * Kategorije koje korisnik može odabrati na objavi i pratiti u obavijestima:
 * sve kategorije mjesta plus "Ostalo".
 */
export const POST_CATEGORY_IDS: string[] = [
  ...Object.keys(placeCategories),
  OTHER_CATEGORY,
];

// ─── Auto-popunjavanje kategorije i "primjereno za" na temelju adrese ─────────
// Nominatim uz svaki rezultat pretrage vraća i OSM "class"/"type" (npr.
// class=amenity, type=restaurant), što odgovara osmTag vrijednostima gore
// (npr. "amenity=restaurant"). Reverznim pretraživanjem po tome možemo
// pogoditi kategoriju objave čim korisnik odabere lokaciju.
// Dodatni OSM class/type parovi po kategoriji, uz onaj jedan definiran u
// placeCategories.osmTag (koji koristi i Overpass pretraga obližnjih mjesta,
// pa ga ne diramo). Nominatim za širi naziv poput "Velebit" zna vratiti
// natural=ridge/saddle/volcano ili place=mountain umjesto natural=peak —
// bez ovoga bi pogađanje kategorije tiho promašilo i polje bi ostalo prazno.
const EXTRA_OSM_MATCHES: Record<string, { class: string; type: string }[]> = {
  mountain: [
    { class: "natural", type: "peak" },
    { class: "natural", type: "hill" },
    { class: "natural", type: "ridge" },
    { class: "natural", type: "saddle" },
    { class: "natural", type: "volcano" },
    { class: "place", type: "mountain" },
  ],
};

export function inferCategoryFromOsmTag(
  osmClass?: string | null,
  osmType?: string | null,
): string | null {
  if (!osmClass) return null;
  const entry = Object.entries(placeCategories).find(([, def]) => {
    const [tagClass, tagType] = def.osmTag.split("=");
    if (tagClass !== osmClass) return false;
    return tagType === "*" || tagType === osmType;
  });
  if (entry) return entry[0];

  const extraEntry = Object.entries(EXTRA_OSM_MATCHES).find(([, matches]) =>
    matches.some((m) => m.class === osmClass && m.type === osmType),
  );
  return extraEntry ? extraEntry[0] : null;
}

// Nazivi poznatih planinskih masiva/lanaca u Hrvatskoj koje Nominatim često
// vraća kao boundary=protected_area (park prirode) ili place=region/locality
// umjesto ijednog natural=* taga iz EXTRA_OSM_MATCHES iznad — npr. "Velebit"
// je zaštićeno područje (Park prirode Velebit), ne pojedinačni vrh, pa
// class/type pogađanje samo po OSM tagu tu redovito promaši. Ovo je zadnja
// linija obrane: ako ništa iz OSM taga ne odgovara, provjeri sadrži li sam
// naziv lokacije neku od ovih riječi.
const CATEGORY_NAME_KEYWORDS: Record<string, string[]> = {
  mountain: [
    "velebit",
    "biokovo",
    "dinara",
    "medvednica",
    "psunj",
    "papuk",
    "učka",
    "ucka",
    "risnjak",
    "ivančica",
    "ivanščica",
    "ivanscica",
    "žumberak",
    "zumberak",
    "kalnik",
    "plješevica",
    "pljesevica",
    "svilaja",
    "mosor",
    "snježnik",
    "snjeznik",
    "bjelolasica",
    "planina",
    "planinski",
    "gorje",
    "mountain",
  ],
};

export function inferCategoryFromLocationName(
  displayName?: string | null,
): string | null {
  if (!displayName) return null;
  const lower = displayName.toLowerCase();
  const entry = Object.entries(CATEGORY_NAME_KEYWORDS).find(([, words]) =>
    words.some((w) => lower.includes(w)),
  );
  return entry ? entry[0] : null;
}

// Grupe kojima objekt ovog tipa obično NIJE prikladan — ostalo se
// pretpostavlja kao prikladno svima. Noćni klub i planine isključuju
// maloljetnike (planinarenje/vrhovi zahtijevaju nadzor/iskustvo koje se ne
// pretpostavlja za djecu bez pratnje); sve ostale kategorije (plaže, muzeji,
// restorani...) su pretpostavljeno primjerene svim dobnim skupinama dok
// korisnik ne izmijeni.
const AGE_GROUP_EXCLUSIONS: Record<string, string[]> = {
  club: ["minors"],
  mountain: ["minors"],
};

export function inferAgeGroupsForCategory(
  categoryId: string | null,
  allAgeGroupIds: readonly string[],
): string[] {
  const excluded = (categoryId && AGE_GROUP_EXCLUSIONS[categoryId]) || [];
  return allAgeGroupIds.filter((id) => !excluded.includes(id));
}

interface CategoryRule {
  queries: string[];
  whitelist: { key: string; values: string[] }[];
  nameDenylist: string[];
}

const CATEGORY_RULES: Record<string, CategoryRule> = {
  restaurant: {
    queries: [
      'node["amenity"="restaurant"]',
      'way["amenity"="restaurant"]',
      'node["amenity"="fast_food"]',
      'way["amenity"="fast_food"]',
      'node["amenity"="food_court"]',
      'way["amenity"="food_court"]',
      // ✅ DODANO: restorani definirani preko cuisine taga
      'node["cuisine"]',
      'way["cuisine"]',
      // ✅ DODANO: restorani definirani preko brand taga
      'node["brand"~"McDonald|KFC|Burger King|Subway|Domino|Pizza Hut",i]',
      'way["brand"~"McDonald|KFC|Burger King|Subway|Domino|Pizza Hut",i]',
      // ✅ DODANO: restorani definirani preko name taga (sadrži "restoran")
      'node["name"~"restoran|pizzeria|grill|ćevabdžinica",i]',
      'way["name"~"restoran|pizzeria|grill|ćevabdžinica",i]',
    ],
    whitelist: [
      { key: "amenity", values: ["restaurant", "fast_food", "food_court"] },
      // ✅ DODANO: dozvoli cuisine i brand tagove
      { key: "cuisine", values: ["*"] },
      { key: "brand", values: ["*"] },
    ],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "inn",
      "rooms",
    ],
  },

  cafe: {
    queries: [
      'node["amenity"="cafe"]',
      'way["amenity"="cafe"]',
      'node["amenity"="coffee_shop"]',
    ],
    // ✅ FIX: maknuto node["amenity"="bar"]["cafe"="yes"] — preširoko, bar tagovi idu u klub
    whitelist: [{ key: "amenity", values: ["cafe", "coffee_shop"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "bmw",
      "audi",
      "mercedes",
      "volkswagen",
      "vw",
      "opel",
      "ford",
      "toyota",
      "auto",
      "automobil",
      "servis",
      "salon automobila",
      "car",
      "fitness",
      "gym",
      "teretana",
    ],
  },

  club: {
    // ✅ FIX: ISKLJUČIVO nightclub — uklonjen "bar" i "pub" koji su uzrok
    // da kafići, beach barovi, lounge barovi, saloni za pse, tasting shopovi
    // sve završi ovdje. Bar ≠ Nightclub u OSM taksonomiji.
    queries: ['node["amenity"="nightclub"]', 'way["amenity"="nightclub"]'],
    whitelist: [{ key: "amenity", values: ["nightclub"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "kladionica",
      "kladi",
      "sportska",
      "bet",
      "betting",
      "mozzart",
      "winbet",
      "superbet",
      "lvbet",
      "premiere",
      "germania",
      "admiral",
      "casino",
      "kockarnica",
      "salon",
      "frizersk",
      "kozmetik",
      "beauty",
      "tasting",
      "shop",
      "trgovin",
      "prodavao",
      "restaurant",
      "restoran",
    ],
  },

  beach: {
    queries: [
      'node["natural"="beach"]',
      'way["natural"="beach"]',
      'relation["natural"="beach"]',
    ],
    whitelist: [{ key: "natural", values: ["beach"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest house",
      "centar",
      "dom",
      "house",
      "rooms",
      "inn",
      "pension",
      "studio",
      "it",
      "d.o.o",
      "nekretnin",
    ],
  },

  landmark: {
    queries: [
      'node["historic"]',
      'way["historic"]',
      'relation["historic"]',
      'node["tourism"="attraction"]',
      'way["tourism"="attraction"]',
      'node["tourism"="viewpoint"]',
      'way["tourism"="viewpoint"]',
      'node["amenity"="place_of_worship"]',
      'way["amenity"="place_of_worship"]',
    ],
    whitelist: [
      {
        key: "historic",
        values: [
          "castle",
          "monument",
          "memorial",
          "ruins",
          "archaeological_site",
          "building",
          "fort",
          "church",
          "city_gate",
          "catacombs",
          "catacomb",
          "bridge",
        ],
      },
      { key: "tourism", values: ["attraction", "viewpoint"] },
      { key: "amenity", values: ["place_of_worship"] },
    ],
    nameDenylist: [
      "advent",
      "božić",
      "christmas",
      "sajam",
      "festival",
      "kino",
      "klub",
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
      "hostel street",
      "winterland",
      "wine & walk",
      "wine walk",
      "wine and walk",
      "museum",
      "muzej", // muzeji idu u svoju kategoriju
      "shell museum",
      "water world",
      "sobe",
      "rooms",
      "millennium", // Hotel Millennium
      "arhiv", // državni arhiv nije turistička znamenitost
      "archive",
      "lacković",
      "biljski krokodil",
      "sakuntala", // park s historic tagom — ide u parks
      "centar nekretnine", // singular
      "nekretnine",
      "employment service", // Croatian Employment Service
      "zapošljavanj", // Hrvatski zavod za zapošljavanje
      "zavod za zaposl", // kratica/alternativa
      "hzz",
    ],
  },

  opg: {
    queries: [
      'node["shop"="farm"]',
      'way["shop"="farm"]',
      'node["produce"]',
      'way["produce"]',
      // ✅ FIX: dodano name filter direktno u query ne pomaže u Overpassu,
      // ali dodajemo farmyard da ne propustimo OPG-ove koji su way
      'node["landuse"="farmyard"]["name"~"OPG",i]',
      'way["landuse"="farmyard"]["name"~"OPG",i]',
    ],
    whitelist: [
      { key: "shop", values: ["farm"] },
      { key: "landuse", values: ["farmyard", "farm"] },
      { key: "produce", values: ["*"] },
      { key: "name", values: ["*"] },
    ],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
      "centar",
      "park",
      "studio",
    ],
  },

  accommodation: {
    queries: [
      'node["tourism"="hotel"]',
      'way["tourism"="hotel"]',
      'node["tourism"="hostel"]',
      'way["tourism"="hostel"]',
      'node["tourism"="apartment"]',
      'way["tourism"="apartment"]',
      'node["tourism"="guest_house"]',
      'way["tourism"="guest_house"]',
      'node["tourism"="motel"]',
      'way["tourism"="motel"]',
      'node["tourism"="bed_and_breakfast"]',
      'way["tourism"="bed_and_breakfast"]',
      'node["tourism"="camp_site"]',
      'way["tourism"="camp_site"]',
      // ✅ DODANO: sobe, rooms, accommodation
      'node["name"~"sobe|rooms|apartments|accommodation",i]',
      'way["name"~"sobe|rooms|apartments|accommodation",i]',
    ],
    whitelist: [
      {
        key: "tourism",
        values: [
          "hotel",
          "hostel",
          "apartment",
          "guest_house",
          "motel",
          "bed_and_breakfast",
          "camp_site",
        ],
      },
    ],
    nameDenylist: [
      "it",
      "d.o.o",
      "nekretnin",
      "centar",
      "park",
      "fitness",
      "kozmetik",
      "salon",
      "ambulanta",
      "ljekarnica",
      "kazalište",
      "theatre",
      "kino",
      "restoran",
      "bischof",
      "restoran",
      "restaurant",
      "bistro",
      "caffe",
      "kafić",
      "zrinjevac",
      "perla",
    ],
  },
  market: {
    // ✅ FIX: uklonjeni supermarket i convenience — korisnik NE želi
    // prikazivati trgovine, samo tržnice (marketplace)
    queries: ['node["amenity"="marketplace"]', 'way["amenity"="marketplace"]'],
    whitelist: [{ key: "amenity", values: ["marketplace"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
      "šetalište",
      "setaliste",
      "ntl",
      "feđika",
      "fedika",
      "park",
      "ulica",
      "trg",
    ],
  },

  paintball: {
    queries: [
      'node["sport"="paintball"]',
      'way["sport"="paintball"]',
      'node["leisure"="sports_centre"]["sport"="paintball"]',
      'way["leisure"="sports_centre"]["sport"="paintball"]',
    ],
    whitelist: [{ key: "sport", values: ["paintball"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
      "centar",
    ],
  },

  cinema: {
    queries: ['node["amenity"="cinema"]', 'way["amenity"="cinema"]'],
    whitelist: [{ key: "amenity", values: ["cinema"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "it",
      "nekretnin",
      "grad ",
      "općina",
      "municipality",
      "dvorac",
      "crkva",
      "muzej",
      "knjižnica",
      "škola",
      "bolnica",
      "zgrada",
      "palace",
      "palača",
      "tvrđava",
      "dom kulture",
      "kulturni centar",
      "kulturni dom",
    ],
  },

  park: {
    queries: [
      'node["leisure"="park"]',
      'way["leisure"="park"]',
      'relation["leisure"="park"]',
    ],
    whitelist: [{ key: "leisure", values: ["park", "garden"] }],
    nameDenylist: [
      "perivoj",
      "dvorac",
      "tvrđava",
      "advent",
      "festival",
      "sajam",
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
      "fićo", // Red fićo (restoran/bar, ne park)
      "red fić",
      "podgorje",
      "suvara",
      "kraševo",
      "krasevo",
      "bikana",
      "čimen",
      "cimen",
      "južni blok",
      "juzni blok",
      "removac",
      "removač",
      // Generički uzorci za naselja i blokove
      "blok",
      "naselje",
      "zaselak",
      "zaselje",
      "ulica",
      "trg",
      "cesta",
      " sa morem",
      "sa morem",
      // Rubna zona / predjel bez prave parkovne infrastrukture
      "predio",
      "predjel",
      "zona",
      "četvrt",
      "cetvrt",
      "kvart",
      "kvart",
      "perivoj", // ← NOVO: Perivoj bana Šokčevića, Perivoj hrvatskih velikana
      "monument", // ← NOVO: Monument to Miroslav Krleža (ima leisure=park tag u OSM-u)
      "miroslav", // ← NOVO: specifično za ovaj monument
      "park sakuntala",
    ],
  },

  escapeRoom: {
    queries: [
      'node["leisure"="escape_game"]',
      'way["leisure"="escape_game"]',
      'node["amenity"="escape_game"]',
      'way["amenity"="escape_game"]',
    ],
    whitelist: [
      { key: "leisure", values: ["escape_game"] },
      { key: "amenity", values: ["escape_game"] },
    ],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
    ],
  },

  museum: {
    queries: ['node["tourism"="museum"]', 'way["tourism"="museum"]'],
    whitelist: [{ key: "tourism", values: ["museum"] }],
    // ✅ FIX: dodani "most", "bridge", "catacomb", "katakomb" — ne smiju biti muzeji
    nameDenylist: [
      "most",
      "bridge",
      "catacomb",
      "katakomb",
      "atrakcija",
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
      "bridge bench",
      "bench",
      "war scarred",
      "scarred building",
      "building",
      "ruin",
      "shell museum",
      "water world",
      "školjaka",
      "skoljaka",
      "catacomb", // ← vraćeno: blokira OSM katakombe u muzejima
      "catacombs",
      "katakomba",
    ],
  },

  theater: {
    queries: [
      'node["amenity"="theatre"]',
      'way["amenity"="theatre"]',
      'relation["amenity"="theatre"]',
    ],

    whitelist: [{ key: "amenity", values: ["theatre"] }],

    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "apartment",
      "apartments",
      "soba",
      "sobe",
      "rooms",
      "room",
      "guest",
      "guesthouse",
      "guest house",
      "smještaj",
      "accommodation",
      "lodging",
      "villa",
      "vila",
      "resort",
      "motel",
      "inn",
      "pansion",
      "bed",
      "breakfast",
      "b&b",
      "studio",
      "suite",
      "kuća za odmor",
      "odmaralište",
      "camp",
      "glamping",
    ],
  },

  mountain: {
    queries: [
      'node["natural"="peak"]',
      'node["natural"="hill"]',
      'way["natural"="peak"]',
    ],
    whitelist: [{ key: "natural", values: ["peak", "hill"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
    ],
  },

  nationalPark: {
    queries: [
      'relation["boundary"="national_park"]',
      'relation["boundary"="protected_area"]["protect_class"="2"]',
      'way["boundary"="national_park"]',
    ],
    whitelist: [
      { key: "boundary", values: ["national_park", "protected_area"] },
      { key: "leisure", values: ["nature_reserve"] },
    ],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
    ],
  },

  cave: {
    queries: [
      'node["natural"="cave_entrance"]',
      'way["natural"="cave_entrance"]',
    ],
    whitelist: [{ key: "natural", values: ["cave_entrance"] }],
    nameDenylist: [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest",
      "it",
      "d.o.o",
      "nekretnin",
    ],
  },

  spa: {
    queries: [
      'node["amenity"="spa"]',
      'way["amenity"="spa"]',
      'node["leisure"="spa"]',
      'way["leisure"="spa"]',
      'node["leisure"="water_park"]',
      'way["leisure"="water_park"]',
      'node["natural"="hot_spring"]',
    ],
    whitelist: [
      { key: "amenity", values: ["spa"] },
      { key: "leisure", values: ["spa", "water_park"] },
      { key: "natural", values: ["hot_spring"] },
    ],
    // ✅ FIX: proširena denylist — ambulanta, beauty salon, fitness, centar kulture tijela ne smiju biti toplice
    nameDenylist: [
      // Medicinsko
      "ambulanta",
      "liječnik",
      "doktor",
      "medicina",
      "medical",
      "obiteljske",
      "dežurna",
      "fizioterapija",
      "fizioterapi",
      "physio",
      "rehabilitaci",
      // Kozmetika — i s dijakriticima
      "beauty",
      "kozmetik",
      "kozmetičk",
      "estetika",
      "estetica",
      "estetska",
      "salon",
      "nail",
      "manikur",
      "pedikur",
      // Fitness
      "fitness",
      "fit",
      "gym",
      "teretana",
      "crossfit",
      "osobni trening",
      "treninzi",
      // Tijelo/njega
      "njegu",
      "kulture tijela",
      "centar kulture",
      "sport i njegu",
      "tensegrity",
      "wellar",
      "body service",
      "body care",
      // Studio/smještaj
      "studio",
      "apartman",
      "hotel",
      "hostel",
      // Poslovno
      "obrt",
      "d.o.o",
      "nekretnin",
      "ljekarnica",
      "apoteka",
      "wellness centar",
    ],
  },
};

// ─── Globalna crna lista naziva koji se NIKADA ne smiju prikazati ─────────────
const GLOBAL_NAME_DENYLIST = [
  "mono d.o.o",
  "centar nekretnina",
  "centar nekretnine",
  "nekretnin",
  "it park",
  "nekretnin",
  "kladionica",
  "sportska kladionica",
  "mozzart",
  "winbet",
  "superbet",
  "lvbet",
  "admiral casino",
  "kockarnica",
  // ✅ FIX: dodano — saloni za pse i slični obrti ne smiju se nigdje prikazati
  "salon za pse",
  "dog salon",
  "frizerski salon",
  "uljepšavanje",
  // ✅ FIX: nekretnine i IT firme
  "agencija za nekretnine",
  "fitness centar",
  "beauty salon",
  "centar ljepote",
  "perla",
  "guest house",
  "guesthouse",
  "apartments",
  "rooms",
  "accommodation",
  "lodging",
  "salon za pse",
  "dog salon",
  "pet salon",
  "grooming salon",
  "njega pasa",
  "šišanje pasa",
  "uređivanje pasa",
  "kućni ljubimac",
  "ljubimac",
  "automat club",
  "automat",
  "gaming club",
  "slot club",
  "tombola",
  "frizerski salon",
  "hair salon",
  "barber shop",
  "brijačnica",
];

// ─── Cache ────────────────────────────────────────────────────────────────────
let placesCache: Map<string, { places: Place[]; timestamp: number }> =
  new Map();
const CACHE_DURATION = 20 * 60 * 1000;

export const clearPlacesCache = () => {
  placesCache.clear();
};

// ─── Red zahtjeva prema Nominatimu ────────────────────────────────────────────
//
// Nominatim je besplatni javni servis s ograničenjem od najviše 1 zahtjeva u
// sekundi po adresi. Zahtjevi idu kroz red, jedan po jedan s razmakom;
// pretraga koju je korisnik upravo pokrenuo ima prednost pred pozadinskim
// dopunjavanjem. (Overpass se ne stavlja u red: svi se upiti šalju u jednom
// zahtjevu, vidi fetchOverpassForTypes.)
type QueueJob = {
  run: () => Promise<unknown>;
  resolve: (v: any) => void;
  reject: (e: any) => void;
};

function createLimiter(maxConcurrent: number, minGapMs: number) {
  const queue: QueueJob[] = [];
  let active = 0;
  let lastStart = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pump = () => {
    if (timer || active >= maxConcurrent || queue.length === 0) return;
    const wait = Math.max(0, lastStart + minGapMs - Date.now());
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null;
        pump();
      }, wait);
      return;
    }
    const job = queue.shift()!;
    active++;
    lastStart = Date.now();
    job
      .run()
      .then(job.resolve, job.reject)
      .finally(() => {
        active--;
        pump();
      });
    pump();
  };

  return function schedule<T>(
    task: () => Promise<T>,
    priority = false,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: QueueJob = { run: task, resolve, reject };
      if (priority) queue.unshift(job);
      else queue.push(job);
      pump();
    });
  };
}

const nominatimLimit = createLimiter(1, 1100);

/** GET na Nominatim kroz red. null = nije uspjelo (mreža, 429, loš odgovor). */
async function nominatimGet(
  url: string,
  priority = false,
): Promise<any[] | null> {
  try {
    const res = await nominatimLimit(async () => {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      try {
        return await fetch(url, {
          headers: { "User-Agent": "CroMapApp/1.0" },
          signal: ctrl.signal,
        });
      } finally {
        clearTimeout(tid);
      }
    }, priority);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

// ─── Geocode city ─────────────────────────────────────────────────────────────
export interface GeocodedCity {
  latitude: number;
  longitude: number;
  displayName: string;
}

// Isti grad se ne geokodira ispočetka pri svakom planu: pamte se samo uspjesi.
const geocodeCache = new Map<string, GeocodedCity>();

export const geocodeCity = async (
  query: string,
): Promise<GeocodedCity | null> => {
  const key = query.trim().toLowerCase();
  const hit = geocodeCache.get(key);
  if (hit) return hit;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
    const data = await nominatimGet(url, true);
    if (!data || !data.length) return null;
    const city: GeocodedCity = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
      displayName:
        data[0].display_name?.split(",").slice(0, 2).join(", ") || query,
    };
    geocodeCache.set(key, city);
    return city;
  } catch {
    return null;
  }
};

// ─── Pretraga po imenu ────────────────────────────────────────────────────────
export const searchPlaces = async (
  query: string,
  lat?: number,
  lon?: number,
): Promise<Place[]> => {
  if (!query.trim()) return [];
  try {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1`;
    if (lat && lon) url += `&lat=${lat}&lon=${lon}`;

    const data = await nominatimGet(url, true);
    if (!data) return [];

    return data.map((item: any) => ({
      id: item.place_id?.toString() || Date.now().toString(),
      name: item.display_name?.split(",")[0] || "Nepoznato",
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      type: "landmark" as Place["type"],
      address: item.display_name,
    }));
  } catch {
    return [];
  }
};

// ─── Haversine (helper) ───────────────────────────────────────────────────────
const haversineKm = (
  a1: number,
  o1: number,
  a2: number,
  o2: number,
): number => {
  const R = 6371,
    dA = ((a2 - a1) * Math.PI) / 180,
    dO = ((o2 - o1) * Math.PI) / 180;
  const a =
    Math.sin(dA / 2) ** 2 +
    Math.cos((a1 * Math.PI) / 180) *
      Math.cos((a2 * Math.PI) / 180) *
      Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ─── Provjeri je li rezultat u bijelo/crnoj listi ─────────────────────────────

/**
 * Je li objekt trajno zatvoren, srušen, u izgradnji ili naprosto nedostupan
 * javnosti?
 *
 * OpenStreetMap takve objekte često zadrži u bazi s dodatnom oznakom umjesto
 * da ih obriše, pa su se na karti pojavljivali kao sasvim obična mjesta —
 * korisnik dođe pred lokal koji više ne postoji. Prefiksirane oznake
 * (disused:amenity=...) upit ionako ne vraća, ali objekti koji uz redovnu
 * oznaku nose i "disused=yes", "abandoned=yes" ili slično — vraća.
 */
// ─── Podudaranje s crnim listama imena ────────────────────────────────────────
//
// Crne liste su se primjenjivale kao obična provjera podniza
// (name.includes(term)). To je tiho brisalo golem broj ispravnih mjesta, jer
// se među izrazima nalaze i vrlo kratki: izraz "it" pojavljuje se u crnoj
// listi 16 od 18 kategorija, pa je SVAKO mjesto kojemu se u imenu bilo gdje
// pojavi niz "it" nestajalo s karte — uključujući sve što se zove po Splitu
// ("Muzej grada Splita", "Plaža Bačvice, Split"), ali i "City Museum" i
// "Maritime Museum". Slično su "car" (Carpe Diem), "bet" (Betina) i "dom"
// izbacivali sasvim obična mjesta.
//
// Sada se izrazi traže na granici riječi:
//   • kratki izrazi (do 3 znaka) moraju biti CIJELA riječ — "it" hvata samo
//     samostalno "IT", ne i "Splita";
//   • dulji izrazi hvataju i nastavak riječi, jer je to i bila namjera —
//     "apartman" i dalje hvata "Apartmani", "nekretnin" hvata "Nekretnine".
const WORD_CHARS = "a-z0-9čćđšžäëïöüáéíóúàèìòùâêîôûñ";

const denyRegexCache = new Map<string, RegExp>();

function denyRegexFor(term: string): RegExp {
  const cached = denyRegexCache.get(term);
  if (cached) return cached;

  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wholeWord = term.trim().length <= 3;
  const re = new RegExp(
    wholeWord
      ? `(^|[^${WORD_CHARS}])${escaped}($|[^${WORD_CHARS}])`
      : `(^|[^${WORD_CHARS}])${escaped}`,
    "i",
  );
  denyRegexCache.set(term, re);
  return re;
}

/** Sadrži li ime neki od zabranjenih izraza (na granici riječi)? */
export function nameMatchesDenylist(name: string, terms: string[]): boolean {
  const lower = name.toLowerCase();
  for (const term of terms) {
    if (!term) continue;
    if (denyRegexFor(term).test(lower)) return true;
  }
  return false;
}

function isPermanentlyClosedOrPrivate(tags: Record<string, string>): boolean {
  const truthy = (v: string | undefined) =>
    v !== undefined && v !== "no" && v !== "false";

  if (
    truthy(tags.disused) ||
    truthy(tags.abandoned) ||
    truthy(tags.demolished) ||
    truthy(tags.razed) ||
    truthy(tags.construction) ||
    truthy(tags.proposed) ||
    truthy(tags.planned)
  ) {
    return true;
  }

  // Oblik "was:amenity=restaurant" / "removed:shop=..." na istom objektu.
  for (const key of Object.keys(tags)) {
    if (
      /^(disused|abandoned|was|removed|demolished|razed|construction|proposed):/.test(
        key,
      )
    ) {
      return true;
    }
  }

  // Neki mapari trajno zatvaranje bilježe kroz radno vrijeme.
  const hours = (tags.opening_hours || "").trim().toLowerCase();
  if (hours === "closed" || hours === "off" || hours === "no") return true;

  // Nije za javnost — privatni pristup, samo za članove/zaposlenike.
  const access = (tags.access || "").toLowerCase();
  if (access === "private" || access === "no" || access === "permit")
    return true;

  const lifecycle = (tags["lifecycle"] || "").toLowerCase();
  if (lifecycle === "disused" || lifecycle === "abandoned") return true;

  return false;
}

function passesFilter(
  tags: Record<string, string>,
  name: string,
  rule: CategoryRule,
): boolean {
  if (isPermanentlyClosedOrPrivate(tags)) return false;

  const nameLower = name.toLowerCase();

  if (nameMatchesDenylist(name, GLOBAL_NAME_DENYLIST)) return false;
  if (nameMatchesDenylist(name, rule.nameDenylist)) return false;

  const ACCOMMODATION_TAGS = [
    "hotel",
    "hostel",
    "apartment",
    "guest_house",
    "motel",
    "bed_and_breakfast",
    "camp_site",
  ];

  if (
    ACCOMMODATION_TAGS.includes(tags.tourism) ||
    ACCOMMODATION_TAGS.includes(tags.accommodation) ||
    ACCOMMODATION_TAGS.includes(tags.building)
  ) {
    return false;
  }

  // ✅ NOVO: Ako objekt ima tourism tag smještaja → nikad nije kazalište/park/muzej
  const ACCOMMODATION_TOURISM_TAGS = [
    "hotel",
    "hostel",
    "apartment",
    "guest_house",
    "motel",
    "bed_and_breakfast",
    "camp_site",
  ];
  if (
    tags.tourism &&
    ACCOMMODATION_TOURISM_TAGS.includes(tags.tourism) &&
    // Iznimka: accommodation kategorija smije imati ove tagove
    !rule.whitelist.some(
      (wl) =>
        wl.key === "tourism" &&
        ACCOMMODATION_TOURISM_TAGS.some((t) => wl.values.includes(t)),
    )
  ) {
    return false;
  }

  const LANDMARK_HISTORIC_VALUES = [
    "castle",
    "monument",
    "memorial",
    "ruins",
    "archaeological_site",
    "building",
    "fort",
    "church",
    "city_gate",
    "catacombs",
    "catacomb",
    "bridge",
  ];
  if (
    tags.historic &&
    LANDMARK_HISTORIC_VALUES.includes(tags.historic) &&
    !rule.whitelist.some((wl) => wl.key === "historic")
  ) {
    return false;
  }

  // ✅ NOVO: Za theater, dodatno provjeri da nije smještaj PO IMENU
  if (rule.whitelist.some((wl) => wl.values.includes("theatre"))) {
    // Ključne riječi koje označavaju smještaj (čak i ako ima amenity=theatre)
    const accommodationNames = [
      "hotel",
      "hostel",
      "apartman",
      "soba",
      "prenočište",
      "guest house",
      "guesthouse",
      "apartment",
      "rooms",
      "smještaj",
      "accommodation",
      "lodging",
      "bed & breakfast",
      "b&b",
      "inn",
      "villa",
      "resort",
      "perla inn",
      "pansion",
      "motel",
      "studio",
      "room",
      "vila",
      "kuća za odmor",
      "odmaralište",
      "aparthotel",
      "apartments",
    ];

    for (const accName of accommodationNames) {
      if (nameLower.includes(accName)) {
        return false;
      }
    }

    // Također provjeri tagove za smještaj
    if (
      tags.tourism === "hotel" ||
      tags.tourism === "hostel" ||
      tags.tourism === "apartment" ||
      tags.tourism === "guest_house"
    ) {
      return false;
    }
    if (tags.amenity === "hotel" || tags.amenity === "hostel") {
      return false;
    }
  }

  // ✅ NOVO: Ako je objekt s amenity=theatre, ali ima i tourism tag za smještaj → odbij
  if (tags.amenity === "theatre") {
    const tourismTags = [
      "hotel",
      "hostel",
      "apartment",
      "guest_house",
      "motel",
      "bed_and_breakfast",
    ];
    if (tags.tourism && tourismTags.includes(tags.tourism)) {
      return false;
    }
  }

  if (Object.keys(tags).length === 0) return false;

  for (const wl of rule.whitelist) {
    const tagVal = tags[wl.key];
    if (!tagVal) continue;
    if (wl.values.includes("*") || wl.values.includes(tagVal)) return true;
  }

  return false;
}
// ─── OPG posebna provjera ─────────────────────────────────────────────────────
function isValidOPG(tags: Record<string, string>, name: string): boolean {
  const combined = [
    name,
    tags.operator || "",
    tags.brand || "",
    tags["official_name"] || "",
    tags.description || "",
  ]
    .join(" ")
    .toUpperCase();
  return (
    combined.includes("OPG") ||
    tags.shop === "farm" || // ako je shop=farm, to je OPG
    tags.produce != null // ako ima produce tag, to je OPG
  );
}

// ─── Deduplikacija po imenu + blizini (za duple prikaze poput Zoo Hotel) ──────
/**
 * Uklanjanje duplikata — ali samo UNUTAR iste kategorije.
 *
 * Overpass i Nominatim daju različite ID-eve za isti objekt, pa se duplikat
 * prepoznaje po nazivu i udaljenosti manjoj od 100 m.
 *
 * Kategorija je ovdje bila izostavljena i to je imalo posljedicu koja se u
 * aplikaciji vidjela kao kriva kategorija na karti. Mjesta se dohvaćaju
 * jednim upitom PO KATEGORIJI, a rezultati se spajaju redom kojim su
 * kategorije zadane. Kako u placeCategories "restaurant" dolazi prije
 * "cafe", lokal označen u OSM-u i kao amenity=restaurant i kao amenity=cafe
 * — a takvih je mnogo, svaka kavana koja poslužuje hranu — zadržao bi se
 * kao restoran, dok bi njegova inačica iz kategorije kafića ispala kao
 * "duplikat".
 *
 * Korisnik bi tako uključio Kafiće i Restorane i vidio restoran ondje gdje
 * zna da je kafić. S uključenom samo jednom kategorijom sve je izgledalo
 * ispravno, pa je greška djelovala nasumično.
 *
 * Isto mjesto koje je stvarno i kafić i restoran sada se pojavljuje pod
 * obje kategorije — to nije duplikat, nego točan odgovor na oba filtra.
 */
function deduplicatePlaces(places: Place[]): Place[] {
  const result: Place[] = [];
  for (const place of places) {
    const isDuplicate = result.some((existing) => {
      if (existing.type !== place.type) return false;
      const sameName =
        existing.name.toLowerCase().trim() === place.name.toLowerCase().trim();
      const closeEnough =
        haversineKm(
          existing.latitude,
          existing.longitude,
          place.latitude,
          place.longitude,
        ) < 0.1; // 100 metara
      return sameName && closeEnough;
    });
    if (!isDuplicate) result.push(place);
  }
  return result;
}

// ─── Overpass API ─────────────────────────────────────────────────────────────

/**
 * Upit kakav ga pišu pravila kategorija, razložen u uvjete — da se za
 * pojedini element iz zajedničkog odgovora može reći koja ga je kategorija
 * uopće tražila.
 */
interface ParsedQuery {
  elType: string;
  conds: {
    key: string;
    op: "exists" | "eq" | "re";
    value: string;
    ci: boolean;
  }[];
}

const parsedQueryCache = new Map<string, ParsedQuery | null>();

function parseQuery(q: string): ParsedQuery | null {
  if (parsedQueryCache.has(q)) return parsedQueryCache.get(q) ?? null;
  const head = q.match(/^(node|way|relation)((?:\[[^\]]*\])*)$/);
  let parsed: ParsedQuery | null = null;
  if (head) {
    const conds: ParsedQuery["conds"] = [];
    const re = /\["([^"]+)"(?:(=|~)"((?:[^"\\]|\\.)*)"(,i)?)?\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(head[2]))) {
      conds.push({
        key: m[1],
        op: m[2] === "=" ? "eq" : m[2] === "~" ? "re" : "exists",
        value: m[3] ?? "",
        ci: !!m[4],
      });
    }
    parsed = { elType: head[1], conds };
  }
  parsedQueryCache.set(q, parsed);
  return parsed;
}

function elementMatchesQuery(el: any, pq: ParsedQuery): boolean {
  if (el.type !== pq.elType) return false;
  const tags = el.tags || {};
  return pq.conds.every((c) => {
    const v = tags[c.key];
    if (v === undefined) return false;
    if (c.op === "exists") return true;
    if (c.op === "eq") return v === c.value;
    try {
      return new RegExp(c.value, c.ci ? "i" : "").test(v);
    } catch {
      return false;
    }
  });
}

function elementMatchesRule(el: any, rule: CategoryRule): boolean {
  return rule.queries.some((q) => {
    const pq = parseQuery(q);
    return pq ? elementMatchesQuery(el, pq) : false;
  });
}

/** Dijagnostika u Metro terminalu (samo u razvoju) — vidi se što i koliko traje. */
const plog = (...args: unknown[]) => {
  if (__DEV__) console.log("[places]", ...args);
};

/** Javni Overpass poslužitelji, redom po pouzdanosti. */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
/**
 * Poslužitelji koji su nedavno odgovorili 429/503/504: nekoliko minuta ih se
 * preskače umjesto da ih se dalje opterećuje (ako su blokirani SVI, ipak se
 * pokušava — bolje pokušaj nego sigurno prazan odgovor).
 */
const endpointBlockedUntil = new Map<string, number>();
/** Ako prvi poslužitelj ne odgovori za toliko, paralelno se pita sljedeći. */
const OVERPASS_HEDGE_MS = 2500;
/** Dulje od ovoga korisnik ionako odustaje; bolje brza greška i ponovni pokušaj. */
const OVERPASS_TIMEOUT_MS = 15000;

/**
 * Jedan upit prema Overpassu uz "hedging": odmah se pita prvi poslužitelj,
 * a ako je spor ili zakaže, pita se sljedeći — dok prvi još radi. Prvi
 * ispravan odgovor pobjeđuje, ostali se prekidaju. Prije se čekalo do 35 s
 * na jedan poslužitelj pa tek onda pokušavalo drugi, a tamo gdje je prvi
 * bio preopterećen to je značilo više od minute "Učitavam…".
 *
 * Vraća elemente, ili null ako nijedan poslužitelj nije uredno odgovorio —
 * to se razlikuje od praznog polja, koje znači "tu doista nema ničega".
 */
function fetchOverpassElements(query: string): Promise<any[] | null> {
  const nowMs = Date.now();
  const usable = OVERPASS_ENDPOINTS.filter(
    (e) => (endpointBlockedUntil.get(e) ?? 0) <= nowMs,
  );
  const endpoints = usable.length > 0 ? usable : OVERPASS_ENDPOINTS;

  return new Promise((resolve) => {
    let settled = false;
    let pending = 0;
    let nextIdx = 0;
    const ctrls: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    const finish = (value: any[] | null) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      ctrls.forEach((c) => c.abort());
      resolve(value);
    };

    const launchNext = () => {
      if (settled || nextIdx >= endpoints.length) return;
      const endpoint = endpoints[nextIdx++];
      pending++;

      const ctrl = new AbortController();
      ctrls.push(ctrl);
      timers.push(setTimeout(() => ctrl.abort(), OVERPASS_TIMEOUT_MS));
      // Sljedeći poslužitelj kreće i ako ovaj samo kasni.
      timers.push(setTimeout(launchNext, OVERPASS_HEDGE_MS));

      const t0 = Date.now();
      const host = endpoint.split("/")[2];
      const failed = (why?: unknown) => {
        pending--;
        if (settled) return;
        plog(
          `Overpass ${host} FAILED after ${Date.now() - t0}ms:`,
          String(why),
        );
        if (nextIdx < endpoints.length) launchNext();
        else if (pending === 0) finish(null);
      };

      fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "CroMapApp/1.0",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: ctrl.signal,
      })
        .then((res) => {
          if (res.status === 429 || res.status === 503 || res.status === 504) {
            // Preopterećen ili ograničava zahtjeve: neko vrijeme ga ne pitamo.
            const retryAfter = Number(res.headers.get("Retry-After"));
            const waitMs =
              Number.isFinite(retryAfter) && retryAfter > 0
                ? Math.min(retryAfter * 1000, 5 * 60 * 1000)
                : 60 * 1000;
            endpointBlockedUntil.set(endpoint, Date.now() + waitMs);
          }
          return res.ok ? res.json() : Promise.reject(res.status);
        })
        .then((data) => {
          // Preopterećen poslužitelj zna odgovoriti 200 s praznim poljem i
          // napomenom o grešci — to nije "nema mjesta", to je neuspjeh.
          if (
            !Array.isArray(data?.elements) ||
            (data.elements.length === 0 &&
              /error|timeout/i.test(data.remark ?? ""))
          ) {
            failed(data?.remark ?? "bad response");
            return;
          }
          plog(
            `Overpass ${host} OK in ${Date.now() - t0}ms, ${data.elements.length} elements`,
          );
          finish(data.elements);
        })
        .catch(failed);
    };

    launchNext();
  });
}

/**
 * Jedan upit za SVE tražene kategorije. Prije je svaka kategorija imala
 * vlastiti zahtjev: plan putovanja je slao 17 upita odjednom, što javni
 * poslužitelji ograničavaju (429/504), pa se čekalo i po nekoliko minuta ili
 * se dobivalo ništa. Jedan zajednički upit je jedan zahtjev, a razvrstavanje
 * po kategorijama obavi se ovdje, na uređaju.
 */
function fetchOverpassForTypes(
  latitude: number,
  longitude: number,
  radiusM: number,
  types: string[],
): Promise<any[] | null> {
  const center = `${latitude},${longitude}`;
  const parts = new Set<string>();
  for (const type of types) {
    for (const q of CATEGORY_RULES[type]?.queries ?? []) parts.add(q);
  }
  const union = [...parts]
    .map((q) => `${q}(around:${radiusM},${center});`)
    .join("\n");

  // "out center tags": way/relation dobivaju središte (bez njega nemaju
  // koordinate pa bi ih se tiho odbacilo), a ne vuku se popisi čvorova.
  const query = `[out:json][timeout:25];
(
${union}
);
out center tags;`;
  return fetchOverpassElements(query);
}

/** Elementi koje je kategorija tražila → mjesta, uz filtre te kategorije. */
function placesFromElements(
  elements: any[],
  latitude: number,
  longitude: number,
  radiusM: number,
  type: string,
): Place[] {
  const rule = CATEGORY_RULES[type];
  if (!rule) return [];

  const results: Place[] = [];

  for (const el of elements) {
    const tags = el.tags || {};
    const name =
      tags.name || tags["name:hr"] || tags["name:en"] || tags["official_name"];
    if (!name) continue;

    // ✅ FIX: el.center sada postoji za way/relation jer koristimo "out body center;"
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (!lat || !lon) continue;

    const dist = haversineKm(latitude, longitude, lat, lon);
    if (dist > radiusM / 1000) continue;

    if (type === "opg") {
      // OPG grana ne prolazi kroz passesFilter, pa provjeru trajno
      // zatvorenih/privatnih objekata treba i ovdje.
      if (isPermanentlyClosedOrPrivate(tags)) continue;
      if (!isValidOPG(tags, name)) continue;
      if (nameMatchesDenylist(name, GLOBAL_NAME_DENYLIST)) continue;
      if (nameMatchesDenylist(name, rule.nameDenylist)) continue;
    } else {
      if (!passesFilter(tags, name, rule)) continue;
    }

    // Posebna provjera za theater - odbij sve što liči na smještaj
    // Theater: odbij smještaj, BEZ name whitelist — amenity=theatre je dovoljan
    if (type === "theater") {
      const nameLower = name.toLowerCase();
      const accommodationIndicators = [
        "hotel",
        "hostel",
        "apartman",
        "apartment",
        "soba",
        "sobe",
        "rooms",
        "room",
        "prenočište",
        "prenoćište",
        "guest",
        "villa",
        "vila",
        "resort",
        "odmaralište",
        "pansion",
        "motel",
        "inn",
        "b&b",
        "bed",
        "breakfast",
        "smještaj",
        "accommodation",
        "lodging",
        "studio",
        "suite",
        "camp",
        "glamping",
        "nekretnin",
      ];
      // Ista logika granice riječi: "inn" i "bed" su prekratki da bi se
      // tražili kao podniz ("Betina", "Vinnica" nisu smještaj).
      if (nameMatchesDenylist(name, accommodationIndicators)) {
        continue;
      }
    }

    results.push({
      id: `osm_${el.type}_${el.id}`,
      name,
      latitude: lat,
      longitude: lon,
      type: type as Place["type"],
      distance: dist,
      address:
        [tags["addr:street"], tags["addr:housenumber"], tags["addr:city"]]
          .filter(Boolean)
          .join(" ") || undefined,
      phone: tags.phone || tags["contact:phone"] || undefined,
      website: tags.website || tags["contact:website"] || undefined,
      openingHours: tags.opening_hours || undefined,
      // Izračunato iz zapisanog radnog vremena (null kad se ne može
      // utvrditi). Dosad se popunjavalo samo iz Googleovog odgovora, pa su
      // mjesta koja dolaze iz OpenStreetMapa uvijek bila "nepoznato".
      openNow: isOpenAt(tags.opening_hours, new Date()),
      rating: tags.stars ? parseFloat(tags.stars) : undefined,
    });
  }

  return results;
}

export interface PlacesResult {
  places: Place[];
  /** Neka kategorija nije dohvaćena (mreža/poslužitelj), pa lista može biti nepotpuna. */
  failed: boolean;
}

export const getPlacesInRadius = async (
  latitude: number,
  longitude: number,
  radiusKm: number,
  types?: Place["type"][],
): Promise<Place[]> =>
  (await getPlacesInRadiusDetailed(latitude, longitude, radiusKm, types))
    .places;

// ─── Glavna izvozna funkcija ──────────────────────────────────────────────────
const inflightPlaces = new Map<string, Promise<PlacesResult>>();

export const getPlacesInRadiusDetailed = (
  latitude: number,
  longitude: number,
  radiusKm: number,
  types?: Place["type"][],
): Promise<PlacesResult> => {
  if (!types || types.length === 0) {
    return Promise.resolve({ places: [], failed: false });
  }

  const radiusM = Math.round(radiusKm * 1000);
  const cacheKey = `${latitude.toFixed(3)},${longitude.toFixed(3)},${radiusM},${[...types].sort().join(",")}`;

  const cached = placesCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return Promise.resolve({ places: cached.places, failed: false });
  }

  // Isti upit koji je već u tijeku (npr. dvostruki okidač) dijeli odgovor.
  const running = inflightPlaces.get(cacheKey);
  if (running) return running;

  const promise = loadPlacesUncached(
    latitude,
    longitude,
    radiusKm,
    types,
    cacheKey,
  ).finally(() => inflightPlaces.delete(cacheKey));
  inflightPlaces.set(cacheKey, promise);
  return promise;
};

async function loadPlacesUncached(
  latitude: number,
  longitude: number,
  radiusKm: number,
  types: Place["type"][],
  cacheKey: string,
): Promise<PlacesResult> {
  const radiusM = Math.round(radiusKm * 1000);
  const tStart = Date.now();

  // Blok smještajnih ključnih riječi za theater (koristi se na dva mjesta)
  const THEATER_BLOCK = [
    "hotel",
    "hostel",
    "guest",
    "guesthouse",
    "guest house",
    "apartman",
    "apartment",
    "apartments",
    "rooms",
    "room",
    "soba",
    "sobe",
    "villa",
    "vila",
    "resort",
    "inn",
    "motel",
    "lodging",
    "accommodation",
    "smještaj",
    "bed",
    "breakfast",
    "b&b",
    "suite",
    "studio",
    "camp",
    "glamping",
    "pansion",
    "pension",
    "nekretnin",
  ];

  let failed = false;

  const knownTypes = types.filter((t) => CATEGORY_RULES[t]);
  const elements =
    knownTypes.length > 0
      ? await fetchOverpassForTypes(latitude, longitude, radiusM, knownTypes)
      : [];
  const overpassFailed = elements === null;
  // Ako OSM nije odgovorio, popis je nepotpun: ne sprema se i korisnik može ponoviti.
  if (overpassFailed) failed = true;
  // Nominatim dopušta ~1 zahtjev u sekundi. Za mali broj kategorija služi kao
  // dopuna rijetkim rezultatima; za veliki (plan putovanja) bi 10+ istodobnih
  // zahtjeva bilo odbijeno i samo produljilo čekanje.
  const useNominatim = types.length <= 3;

  const perType = await Promise.all(
    types.map(async (type): Promise<Place[]> => {
      const rule = CATEGORY_RULES[type];
      const overpassResults =
        elements && rule
          ? placesFromElements(
              elements.filter((el) => elementMatchesRule(el, rule)),
              latitude,
              longitude,
              radiusM,
              type,
            )
          : [];
      const markFailedIfEmpty = (res: Place[]): Place[] => {
        if (overpassFailed && res.length === 0) failed = true;
        return res;
      };

      if (type === "theater") {
        // OSM amenity=theatre je dovoljan — ne trebamo name whitelist.
        // Blokiramo samo očiti smještaj.
        const filtered = overpassResults.filter((p) => {
          const n = p.name.toLowerCase().trim();
          return !THEATER_BLOCK.some((bad) => n.includes(bad));
        });

        // Nominatim fallback samo ako OSM nema dovoljno, ali s name filterom
        // jer Nominatim vraća gradove/regije za query "theatre"
        if (useNominatim && filtered.length < 2) {
          const nominatimResults = await fetchFromNominatim(
            latitude,
            longitude,
            radiusKm,
            type,
          );
          const validNominatim = nominatimResults.filter((p) => {
            const n = p.name.toLowerCase().trim();
            // WHITELIST: samo stvarna kazališta po imenu
            const isRealTheater =
              n.includes("kazalište") ||
              n.includes("kazaliste") ||
              n.includes("teatar") ||
              n.includes("theatre") ||
              n.includes("theater") ||
              n.startsWith("hnk") ||
              n.includes("dječje") ||
              n.includes("narodno");
            if (!isRealTheater) return false;
            // BLACKLIST: ukloni smještaj
            return !THEATER_BLOCK.some((bad) => n.includes(bad));
          });
          const existingIds = new Set(filtered.map((p) => p.id));
          return markFailedIfEmpty([
            ...filtered,
            ...validNominatim.filter((p) => !existingIds.has(p.id)),
          ]);
        }
        return markFailedIfEmpty(filtered);
      }

      // Sve ostale kategorije — standardni Nominatim fallback
      if (useNominatim && overpassResults.length < 3) {
        const nominatimResults = await fetchFromNominatim(
          latitude,
          longitude,
          radiusKm,
          type,
        );
        const existingIds = new Set<string>(
          overpassResults.map((p: Place) => p.id),
        );
        const extra = nominatimResults.filter(
          (p: Place) => !existingIds.has(p.id),
        );
        return markFailedIfEmpty([...overpassResults, ...extra]);
      }
      return overpassResults;
    }),
  );

  let allPlaces = perType.flat();

  // Post-filter za theater — ukloni smještaj koji je možda ušao kroz Google
  // (street keyword provjera uklonjena — blokirala je legitimna kazališta)
  if (types.includes("theater")) {
    allPlaces = allPlaces.filter((place) => {
      if (place.type !== "theater") return true;
      const nameLower = place.name.toLowerCase();
      return !THEATER_BLOCK.some((kw) => nameLower.includes(kw));
    });
  }

  const deduped = deduplicatePlaces(allPlaces);
  deduped.sort((a: Place, b: Place) => (a.distance ?? 0) - (b.distance ?? 0));

  // Nepotpun rezultat se ne sprema: ponovni pokušaj mora ići na mrežu, a ne
  // vratiti isti prazan prikaz iz cachea.
  plog(
    `${types.length} categories, ${deduped.length} places, ${failed ? "INCOMPLETE" : "ok"}, ${Date.now() - tStart}ms`,
  );
  if (!failed) {
    placesCache.set(cacheKey, { places: deduped, timestamp: Date.now() });
  } else if (deduped.length === 0) {
    // Ništa nije uspjelo: bolje je pokazati zadnji poznati rezultat (stariji
    // od roka predmemorije, ali ispravan) nego praznu kartu.
    const stale = placesCache.get(cacheKey);
    if (stale) return { places: stale.places, failed: true };
  }
  return { places: deduped, failed };
}

// ─── Nominatim fallback po kategoriji ────────────────────────────────────────
const NOMINATIM_CATEGORY_QUERIES: Record<string, string> = {
  restaurant: "restaurant OR fast food OR pizzeria OR grill",
  cafe: "cafe",
  // ✅ FIX: club fallback samo za nightclub, ne "bar"
  club: "nightclub",
  beach: "beach",
  landmark: "castle OR church OR monument OR historic",
  accommodation: "hotel",
  // ✅ FIX: market fallback samo za tržnicu, ne "market" (preširoko)
  market: "marketplace",
  cinema: "cinema",
  park: "park",
  museum: "museum",
  theater: "theatre",
  mountain: "peak",
  spa: "spa",
  escapeRoom: "escape room",
  paintball: "paintball",
  cave: "cave",
  nationalPark: "national park",
  opg: "farm OR OPG",
};

async function fetchFromNominatim(
  latitude: number,
  longitude: number,
  radiusKm: number,
  type: string,
): Promise<Place[]> {
  const query = NOMINATIM_CATEGORY_QUERIES[type];
  if (!query) return [];

  try {
    const delta = radiusKm / 111;
    const bbox = `${longitude - delta},${latitude - delta},${longitude + delta},${latitude + delta}`;

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&viewbox=${bbox}&bounded=1&limit=15&addressdetails=1`;

    const data = await nominatimGet(url);
    if (!data) return [];

    const rule = CATEGORY_RULES[type];
    const results: Place[] = [];

    for (const item of data) {
      const lat = parseFloat(item.lat);
      const lon = parseFloat(item.lon);
      const dist = haversineKm(latitude, longitude, lat, lon);
      if (dist > radiusKm) continue;

      const name = item.name || item.display_name?.split(",")[0];
      if (!name || name.length < 2) continue;

      const nameLower = name.toLowerCase();

      // Iste crne liste kao u glavnom putu, i jednako na granici riječi.
      if (nameMatchesDenylist(name, GLOBAL_NAME_DENYLIST)) continue;
      if (rule && nameMatchesDenylist(name, rule.nameDenylist)) continue;

      if (type === "park") {
        const isRealPark =
          nameLower.includes("park") ||
          nameLower.includes("garden") ||
          nameLower.includes("šetalište") ||
          nameLower.includes("setaliste");
        if (!isRealPark) continue;
      }

      results.push({
        id: `nom_${type}_${item.place_id}`,
        name,
        latitude: lat,
        longitude: lon,
        type: type as Place["type"],
        distance: dist,
        address: item.display_name?.split(",").slice(1, 3).join(",").trim(),
      });
    }
    return results;
  } catch {
    return [];
  }
}

export default {
  searchPlaces,
  getPlacesInRadius,
  getPlacesInRadiusDetailed,
  placeCategories,
  clearPlacesCache,
  geocodeCity,
};
