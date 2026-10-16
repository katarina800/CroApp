/**
 * PlanMyDayModal.tsx — v9 COMPLETE FIX
 *
 * POPRAVCI:
 * 1. [SINKRONIZACIJA KARTA↔OPIS] Karta i opis koriste IDENTIČAN niz venue-ova
 * 2. [IKONE] Slike se prikazuju ispravno - fallback na emoji ako slika ne postoji
 * 3. [DUGME OTVORI] Prikazuje se za SVAKU aktivnost koja ima venue
 * 4. [RADNO VRIJEME] Hardkodirani raspored koji poštuje radno vrijeme
 * 5. [BROJEVI] Svaka aktivnost ima jedinstven broj (1-8)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Animated,
  useWindowDimensions,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { AreaActivitiesSheet } from "./AreaActivitiesSheet";
import { API_BASE_URL } from "../app/config/api"; // prilagodi putanju

import {
  geocodeCity,
  getPlacesInRadius,
  Place,
  placeCategories,
} from "../app/services/locationService";
import { T, pb } from "../styles/varaTheme";
// Ikone (nove; stare viking kovanice su u LEGACY_ICONS, prekidač USE_LEGACY_ICONS).
import { APP_ICONS } from "../constants/icons";
import { useTheme } from "./AdaptiveThemeProvider";

// ---------------------------------------------------------------------------
// Tipovi
// ---------------------------------------------------------------------------
type PlanStep = "form" | "loading" | "result";
type PlanStyle = "opusteno" | "kulturno" | "avantura";
type TransportType = "auto" | "javni" | "pjesice" | "bicikl";
type CompanionType = "solo" | "partner" | "prijatelji" | "obitelj";

interface VenueItem {
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
}

interface VenueWithType {
  venue: VenueItem;
  type: string;
}

interface DayActivity {
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

interface VisitRecord {
  id: string;
  placeId: string;
  placeName: string;
  placeType: string;
  latitude: number;
  longitude: number;
  address?: string;
  visitedAt: string;
}

interface PlaceDetailModalProps {
  place: Place | null;
  visible: boolean;
  onClose: () => void;
  onMarkVisited: (p: Place) => void;
  onHidePlace: (id: string) => void;
  isVisited: boolean;
  notifPrefs: {
    appEnabled: boolean;
    emailEnabled: boolean;
    email: string;
    categories: string[];
  };
  onToggleNotif: (catId: string) => void;
}

export interface PlanMyDayModalProps {
  visible: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  onClose: () => void;
  onMarkVisited?: (place: Place) => Promise<void>;
  visits?: VisitRecord[];
  PlaceDetailModalComponent: React.ComponentType<PlaceDetailModalProps>;
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------

function getDC(isDark: boolean) {
  return {
    bg: isDark ? "#1a2e1a" : "#f0ede4",
    card: isDark ? "#2a4230" : "#e4ead8",
    cardHover: isDark ? "#3a5a30" : "#ccdcb8",
    border: isDark ? "#4a7040" : "#5a8a40",
    borderDim: isDark ? "#3a5a30" : "#c0d0a8",
    text: isDark ? "#e8e8e8" : "#1a2a18",
    textSub: isDark ? "#c0c0c0" : "#3a4a35",
    textDim: isDark ? "#a0a0a0" : "#5a6a55",
    accent: isDark ? "#5a8a48" : "#3a6a28",
    gold: "#B8A060",
    inputBg: isDark ? "#2a4230" : "#e4ead8",
    inputBorder: isDark ? "#4a7040" : "#5a8a40",
    danger: isDark ? "#8B3030" : "#7a2020",
  } as const;
}

// ---------------------------------------------------------------------------
// Konstante
// ---------------------------------------------------------------------------
const ROUTE_COLORS = [
  "#d63031",
  "#00b894",
  "#0984e3",
  "#e17055",
  "#6c5ce7",
  "#00cec9",
  "#fd79a8",
];

const EMOJIS: Record<string, string> = {
  restaurant: "🍽️",
  cafe: "☕",
  club: "🎵",
  beach: "🏖️",
  landmark: "🏰",
  opg: "🌾",
  accommodation: "🏨",
  market: "🛒",
  paintball: "🎯",
  cinema: "🎬",
  park: "🌳",
  escapeRoom: "🔐",
  museum: "🏛️",
  theater: "🎭",
  mountain: "⛰️",
  nationalPark: "🏞️",
  cave: "🕳️",
  spa: "💧",
};

// Marker slike

const MARKER_IMAGES: Record<string, any> = {
  restaurant: APP_ICONS.restaurant,
  cafe: APP_ICONS.cafe,
  club: APP_ICONS.club,
  beach: APP_ICONS.beach,
  landmark: APP_ICONS.landmark,
  opg: APP_ICONS.opg,
  accommodation: APP_ICONS.accommodation,
  market: APP_ICONS.market,
  paintball: APP_ICONS.paintball,
  cinema: APP_ICONS.cinema,
  park: APP_ICONS.park,
  escapeRoom: APP_ICONS.escapeRoom,
  museum: APP_ICONS.museum,
  theater: APP_ICONS.theater,
  mountain: APP_ICONS.mountain,
  nationalPark: APP_ICONS.nationalPark,
  cave: APP_ICONS.cave,
  spa: APP_ICONS.spa,
  other: APP_ICONS.other,
};

const putnikIcon = APP_ICONS.traveller;

// ---------------------------------------------------------------------------
// Haversine
// ---------------------------------------------------------------------------
function haversineKm(a1: number, o1: number, a2: number, o2: number): number {
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

// ---------------------------------------------------------------------------
// Helper funkcije
// ---------------------------------------------------------------------------
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function venueNamesMatch(a: string, b: string): boolean {
  const n1 = normalize(a);
  const n2 = normalize(b);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
}

function findVenueByName(
  name: string,
  allVenues: Record<string, VenueItem[]>,
  typeHint?: string | null,
): { venue: VenueItem; type: string } | null {
  if (!name) return null;
  const normalized = normalize(name);

  for (const [type, list] of Object.entries(allVenues)) {
    for (const v of list) {
      if (venueNamesMatch(v.name, name)) {
        return { venue: v, type };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// RASPORED DANA — generator koji popunjava dan stvarnim mjestima
// ---------------------------------------------------------------------------
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

interface ActivityTemplate {
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
const ACTIVITY_CATALOG: ActivityTemplate[] = [
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

function getTimeBasedActivities(
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
// ---------------------------------------------------------------------------
// fetchVenuesNearCity
// ---------------------------------------------------------------------------
async function fetchVenuesNearCity(
  cityQuery: string,
  radiusKm: number,
  interests: string[],
): Promise<{
  geocoded: { latitude: number; longitude: number; displayName: string } | null;
  venues: Record<string, VenueItem[]>;
}> {
  const geocoded = await geocodeCity(cityQuery);
  if (!geocoded) return { geocoded: null, venues: {} };
  // Predmemorija se NE briše: dijeli je glavna karta, a ključ već sadrži
  // koordinate, radijus i kategorije, pa stari zapisi ne smetaju. Brisanje je
  // pri svakom planu bacalo i sve što je karta već učitala.

  const allCats = [
    "restaurant",
    "cafe",
    "beach",
    "landmark",
    "park",
    "museum",
    "accommodation",
    "club",
    "cinema",
    "theater",
    "spa",
    "market",
    "mountain",
    "nationalPark",
    "cave",
    "escapeRoom",
    "paintball",
  ];
  const cats = interests.length > 0 ? interests : allCats;
  const places = await getPlacesInRadius(
    geocoded.latitude,
    geocoded.longitude,
    radiusKm,
    cats as any,
  );

  const venues: Record<string, VenueItem[]> = {};
  for (const p of places) {
    if (!venues[p.type]) venues[p.type] = [];
    if (venues[p.type].length < 8) {
      venues[p.type].push({
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
      });
    }
  }
  return { geocoded, venues };
}

// ---------------------------------------------------------------------------
// ProgressBar
// ---------------------------------------------------------------------------
function ProgressBar({ step, total }: { step: number; total: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: (step + 1) / total,
      duration: 600,
      useNativeDriver: false,
    }).start();
  }, [step]);
  return (
    <View style={pb.track}>
      <Animated.View
        style={[
          pb.fill,
          {
            width: anim.interpolate({
              inputRange: [0, 1],
              outputRange: ["0%", "100%"],
            }),
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// PulsingDot
// ---------------------------------------------------------------------------
function PulsingDot({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1.4,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);
  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: color,
        transform: [{ scale: anim }],
      }}
    />
  );
}

const InterestiGrid = React.memo(function InterestiGrid({
  interests,
  onToggle,
  DC,
  t,
}: {
  interests: string[];
  onToggle: (id: string) => void;
  DC: ReturnType<typeof getDC>;
  t: (key: string, opts?: any) => string;
}) {
  const keys = Object.keys(EMOJIS);
  // useWindowDimensions umjesto Dimensions.get() na razini modula: ono se
  // očita jednom pri učitavanju i nikad se ne osvježi, pa je u podijeljenom
  // zaslonu ili na preklopnom uređaju širina kartica ostajala kriva.
  const { width: windowWidth } = useWindowDimensions();
  const cardW = (windowWidth - 32 - 4) / 2 - 2;

  return (
    <View style={{ gap: 4 }}>
      {Array.from({ length: Math.ceil(keys.length / 2) }, (_, i) => {
        const pair = keys.slice(i * 2, i * 2 + 2);
        return (
          <View
            key={`row_${i}`}
            style={{ flexDirection: "row", gap: 4, marginHorizontal: -14 }}
          >
            {pair.map((id) => {
              const active = interests.includes(id);
              return (
                <TouchableOpacity
                  key={id}
                  style={{
                    width: cardW,
                    height: 130,
                    borderRadius: 12,
                    backgroundColor: active ? DC.border : DC.card,
                    borderWidth: active ? 2 : 1,
                    borderColor: active ? DC.border : DC.borderDim,
                    justifyContent: "center",
                    alignItems: "center",
                    paddingHorizontal: 4,
                    paddingVertical: 8,
                  }}
                  onPress={() => onToggle(id)}
                >
                  {MARKER_IMAGES[id] ? (
                    <Image
                      source={MARKER_IMAGES[id]}
                      style={{ width: 96, height: 96, marginBottom: 4 }}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={{ fontSize: 56, marginBottom: 4 }}>
                      {EMOJIS[id]}
                    </Text>
                  )}
                  <Text
                    style={{
                      fontSize: T.caption,
                      fontWeight: active ? "700" : "600",
                      color: active ? "#fff" : DC.textSub,
                      textAlign: "center",
                    }}
                    numberOfLines={2}
                  >
                    {t(`categories.${id}`, { defaultValue: id })}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        );
      })}
    </View>
  );
});

// ---------------------------------------------------------------------------
// SimpleMarker - IKONE SE PRIKAZUJU ISPRAVNO
// ---------------------------------------------------------------------------
// SimpleMarker - IKONE SE PRIKAZUJU ISPRAVNO
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// SimpleMarker - IDENTIČAN PATTERN kao PlaceMarker u dashboard.tsx
// ---------------------------------------------------------------------------

function SimpleMarker({
  activity,
  color,
  isActive,
  isCompleted,
  onPress,
}: {
  activity: DayActivity;
  color: string;
  isActive: boolean;
  isCompleted: boolean;
  onPress: () => void;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);

  if (!activity.venue) return null;

  const markerColor = isCompleted ? "#34c759" : color;
  const iconSource = MARKER_IMAGES[activity.venueType];
  const isFallback = activity.venueName.startsWith("Lokalni ");

  return (
    <Marker
      coordinate={{
        latitude: activity.venue.latitude,
        longitude: activity.venue.longitude,
      }}
      tracksViewChanges={!imageLoaded}
      onPress={onPress}
      anchor={{ x: 0.5, y: 1 }}
    >
      <View
        style={{
          alignItems: "center",
          width: 60,
          height: 74,
          opacity: isFallback ? 0.55 : 1,
        }}
      >
        {/* Broj badge */}
        <View
          style={{
            position: "absolute",
            top: -4,
            right: 2,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: markerColor,
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 2,
            borderColor: "#fff",
            zIndex: 10,
            elevation: 10,
          }}
        >
          <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>
            {isCompleted ? "✓" : activity.order + 1}
          </Text>
        </View>

        {/* Ikona */}
        {iconSource && !isFallback ? (
          <ImageBackground
            source={iconSource}
            style={{
              width: 50,
              height: 50,
              justifyContent: "center",
              alignItems: "center",
            }}
            imageStyle={{
              width: 50,
              height: 50,
              borderRadius: 25,
              borderWidth: isActive ? 3 : 2.5,
              borderColor: isCompleted
                ? "#34c759"
                : isActive
                  ? "#fff"
                  : markerColor,
            }}
            resizeMode="contain"
            fadeDuration={0}
            onLoad={() => setImageLoaded(true)}
          >
            <View
              style={{
                position: "absolute",
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: markerColor,
                opacity: isActive ? 0.35 : 0.2,
              }}
            />
            {isActive && (
              <View
                style={{
                  position: "absolute",
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  borderWidth: 3,
                  borderColor: markerColor,
                  opacity: 0.8,
                }}
              />
            )}
          </ImageBackground>
        ) : (
          // Fallback i emoji prikaz — uvijek funkcionira
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: isFallback ? "#888888" : markerColor,
              justifyContent: "center",
              alignItems: "center",
              borderWidth: isActive ? 3 : 2.5,
              borderColor: isActive ? "#fff" : isFallback ? "#aaaaaa" : "#fff",
            }}
          >
            <Text style={{ fontSize: isActive ? 22 : 18 }}>
              {EMOJIS[activity.venueType] || "📍"}
            </Text>
          </View>
        )}

        {/* Stem */}
        <View
          style={{
            width: isActive ? 4 : 3,
            height: 12,
            backgroundColor: isFallback ? "#888888" : markerColor,
            borderBottomLeftRadius: 3,
            borderBottomRightRadius: 3,
            marginTop: -2,
          }}
        />
      </View>
    </Marker>
  );
}

// ---------------------------------------------------------------------------
// GLAVNA KOMPONENTA
// ---------------------------------------------------------------------------
export function PlanMyDayModal({
  visible,
  userLocation,
  onClose,
  onMarkVisited,
  visits = [],
  PlaceDetailModalComponent,
}: PlanMyDayModalProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const DC = getDC(isDark);

  const [step, setStep] = useState<PlanStep>("form");
  const [destination, setDestination] = useState("");
  // Provjera postoji li uneseno mjesto/grad — prije se bilo koji tekst
  // prihvaćao bez ikakve provjere, pa je tipfeler u nazivu grada tiho
  // proizvodio prazan/pokvaren plan bez ijedne poruke greške.
  const [locationValid, setLocationValid] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<
    { displayName: string; lat: string; lon: string }[]
  >([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const [searchingLocation, setSearchingLocation] = useState(false);
  const locationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [numDays, setNumDays] = useState(1);
  const [planStyle, setPlanStyle] = useState<PlanStyle>("kulturno");
  const [spontaneous, setSpontaneous] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [companions, setCompanions] = useState<CompanionType | null>(null);
  const [transport, setTransport] = useState<TransportType | null>(null);
  const [budget, setBudget] = useState("");
  const [activityRadius, setActivityRadius] = useState<number | null>(null);
  const [interests, setInterests] = useState<string[]>([]);

  const [activeDay, setActiveDay] = useState(0);
  const [activeStop, setActiveStop] = useState<number>(0);
  const [completedStops, setCompletedStops] = useState<Set<number>>(new Set());

  const [result, setResult] = useState("");
  const [allVenues, setAllVenues] = useState<Record<string, VenueItem[]>>({});
  const [geocodedCoords, setGeocodedCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [generatedNumDays, setGeneratedNumDays] = useState(1);
  // Stil s kojim je plan generiran — prikaz na karti mora ostati isti i
  // ako korisnik nakon generiranja promijeni izbor u formi.
  const [generatedStyle, setGeneratedStyle] = useState<PlanStyle>("kulturno");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );

  const [loadingStep, setLoadingStep] = useState(0);
  const loadingInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  // Generiranje: jedan pokušaj odjednom, i oznaka tekućeg pokušaja. Bez toga je
  // drugi dodir (ili ponovno generiranje) pokretao paralelni upit, a prvi je
  // interval za animaciju učitavanja ostajao živ zauvijek — modal se tada
  // ponovno iscrtavao svake 2 sekunde i usporavao kartu i sve ostalo.
  const generatingRef = useRef(false);
  const generationIdRef = useRef(0);

  useEffect(
    () => () => {
      generationIdRef.current++;
      if (loadingInterval.current) clearInterval(loadingInterval.current);
    },
    [],
  );
  const [localVisitedIds, setLocalVisitedIds] = useState<Set<string>>(
    new Set(),
  );

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [planRating, setPlanRating] = useState(0);
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  const mapRef = useRef<MapView>(null);
  // Vanjski ScrollView — da se nakon odabira mjesta iz popisa vrati gore na
  // kartu; inače korisnik dotakne kafić i ne vidi da se išta dogodilo.
  const pageScrollRef = useRef<ScrollView>(null);
  /**
   * Mjesto koje korisnik razgledava na karti.
   *
   * Popis kafića/parkova/kina davao je samo naziv, adresu i udaljenost u
   * kilometrima — a "2.9 km" ne kaže je li to niz ulicu ili na drugu stranu
   * grada. Sad se dodirom mjesto pokaže na karti zajedno s korisnikovim
   * položajem, pa se vidi kamo zapravo treba.
   */
  /** Objave oko grada za koji je plan napravljen. */
  const [areaSheetOpen, setAreaSheetOpen] = useState(false);
  const [previewVenue, setPreviewVenue] = useState<{
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const LOADING_MESSAGES = [
    { icon: "", text: t("plan.loadingMsg1") },
    { icon: "", text: t("plan.loadingMsg2") },
    { icon: "", text: t("plan.loadingMsg3") },
    { icon: "", text: t("plan.loadingMsg4") },
    { icon: "", text: t("plan.loadingMsg5") },
  ];

  useEffect(() => {
    setLocalVisitedIds(new Set(visits.map((v) => v.placeId)));
  }, [visits]);

  useEffect(() => {
    setActiveStop(0);
    setCompletedStops(new Set());
  }, [activeDay]);

  // Aktivne aktivnosti za dan (prikaz po satima + markeri na karti).
  // Mora dobiti iste postavke kao i tekstualni plan, inače bi prikaz na
  // ekranu i podijeljeni tekst plana pokazivali različita vremena.
  const activeDayActivities: DayActivity[] = useMemo(() => {
    if (geocodedCoords && Object.keys(allVenues).length > 0) {
      const now = new Date();
      return getTimeBasedActivities(allVenues, activeDay, geocodedCoords, t, {
        spontaneous,
        nowMinutes: now.getHours() * 60 + now.getMinutes(),
        style: generatedStyle,
        dayCount: generatedNumDays,
      });
    }
    return [];
  }, [
    allVenues,
    activeDay,
    geocodedCoords,
    t,
    spontaneous,
    generatedStyle,
    generatedNumDays,
  ]);

  // Auto-fit karte
  useEffect(() => {
    if (!mapRef.current || !mapReady || activeDayActivities.length === 0)
      return;
    const coords = activeDayActivities
      .filter((a) => a.venue)
      .map((a) => ({
        latitude: a.venue!.latitude,
        longitude: a.venue!.longitude,
      }));
    if (coords.length > 0) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      }, 350);
    }
  }, [activeDayActivities, mapReady]);

  // Auto-scroll na aktivni marker
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const activity = activeDayActivities[activeStop];
    if (!activity?.venue) return;
    setTimeout(() => {
      mapRef.current?.animateToRegion(
        {
          latitude: activity.venue!.latitude,
          longitude: activity.venue!.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        },
        600,
      );
    }, 300);
  }, [activeStop, mapReady, activeDayActivities]);

  const reset = () => {
    setStep("form");
    setResult("");
    setAllVenues({});
    setGeocodedCoords(null);
    setActiveDay(0);
    setActiveStop(0);
    setCompletedStops(new Set());
    setMapReady(false);
    setExpandedCategories(new Set());
    setPlanRating(0);
    setRatingSubmitted(false);
    setGeneratedNumDays(1);
    setLoadingStep(0);
    // ← DODAJ OVO:
    setCompanions(null);
    setTransport(null);
    setBudget("");
    setActivityRadius(null);
    setInterests([]);
    setSpontaneous(false);
    setDestination("");
    setNumDays(1);
    // Zatvaranje prekida tekuće generiranje: njegov kasni odgovor se odbacuje.
    generationIdRef.current++;
    generatingRef.current = false;
    if (loadingInterval.current) clearInterval(loadingInterval.current);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const isVenueVisited = (venue: VenueItem, type: string) => {
    const id = `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`;
    return localVisitedIds.has(id);
  };

  const handleMarkVisited = async (venue: VenueItem | null, type: string) => {
    if (!venue) return;
    const id = `plan_${type}_${venue.name.replace(/\s+/g, "_").toLowerCase()}`;
    if (localVisitedIds.has(id)) return;
    setLocalVisitedIds((prev) => new Set([...prev, id]));
    if (onMarkVisited) {
      await onMarkVisited({
        id,
        name: venue.name,
        latitude: venue.latitude,
        longitude: venue.longitude,
        type: type as Place["type"],
        address: venue.address,
      });
    }
  };

  const submitRating = async () => {
    if (planRating === 0) return;
    setRatingLoading(true);
    setRatingError(null);
    try {
      // Ovdje su stajali ključevi "userToken" i "userData" — nijedan se
      // nigdje ne upisuje (komentar uz njih je i priznavao nesigurnost).
      // Token je zato uvijek bio prazan, a ime korisnika također, pa je
      // SVAKA ocjena plana stizala adminu kao "Anonimni korisnik". Nije
      // pucalo jer je ruta /api/plan-ratings namjerno dostupna i bez
      // prijave — samo se tiho gubilo tko je ocijenio.
      const [token, firstName, lastName] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("firstName"),
        AsyncStorage.getItem("lastName"),
      ]);
      const userName =
        `${firstName ?? ""} ${lastName ?? ""}`.trim() || t("plan.anonymous");

      const response = await fetch(`${API_BASE_URL}/api/plan-ratings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          rating: planRating,
          destination,
          userName,
        }),
      });

      if (!response.ok) throw new Error("Server error");
      setRatingSubmitted(true);
    } catch {
      setRatingError(t("plan.ratingError"));
    } finally {
      setRatingLoading(false);
    }
  };

  const searchDestination = (query: string) => {
    setDestination(query);
    setLocationValid(false);

    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);

    if (query.trim().length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    locationDebounceRef.current = setTimeout(async () => {
      setSearchingLocation(true);
      try {
        const token = await AsyncStorage.getItem("token");
        const res = await fetch(
          `${API_BASE_URL}/api/locationsearch/autocomplete?query=${encodeURIComponent(query.trim())}`,
          token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
        );
        if (res.ok) {
          const data = await res.json();
          setLocationSuggestions(data);
          setShowLocationSuggestions(data.length > 0);
        }
      } catch {
        setLocationSuggestions([]);
      } finally {
        setSearchingLocation(false);
      }
    }, 400);
  };

  const selectDestination = (suggestion: { displayName: string }) => {
    setDestination(suggestion.displayName);
    setLocationValid(true);
    setShowLocationSuggestions(false);
    setLocationSuggestions([]);
  };

  const generate = React.useCallback(async () => {
    if (!destination.trim()) {
      Alert.alert(t("plan.destination"), t("plan.destinationRequired"));
      return;
    }
    if (!locationValid) {
      Alert.alert(t("plan.destination"), t("plan.destinationNotVerified"));
      return;
    }

    // Već traje: drugi dodir ne smije pokrenuti paralelni upit.
    if (generatingRef.current) return;
    generatingRef.current = true;
    const runId = ++generationIdRef.current;

    setLoadingStep(0);
    setStep("loading");

    // Prethodni interval se uvijek ugasi prije novog (inače curi).
    if (loadingInterval.current) clearInterval(loadingInterval.current);
    loadingInterval.current = setInterval(() => {
      setLoadingStep((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2000);

    try {
      const query = [destination.trim(), "Hrvatska"].join(" ");
      const { geocoded, venues } = await fetchVenuesNearCity(
        query,
        activityRadius ?? 5, // fallback na 5km ako nije odabrano
        interests,
      );

      // Modal je u međuvremenu zatvoren ili je pokrenut novi pokušaj.
      if (runId !== generationIdRef.current) return;

      // Nema ni jednog mjesta: prije se ovdje ipak "gradio" prazan plan i
      // prikazivao kao uspjeh. Najčešće je uzrok privremen (servisi s kojih se
      // mjesta dohvaćaju su preopterećeni), pa korisnik dobiva jasan savjet i
      // ostaje na formi da može odmah ponoviti.
      if (!geocoded || Object.keys(venues).length === 0) {
        if (loadingInterval.current) clearInterval(loadingInterval.current);
        Alert.alert(
          t("plan.destination"),
          geocoded ? t("plan.noVenues") : t("plan.planError"),
        );
        setStep("form");
        return;
      }

      setAllVenues(venues);
      setGeocodedCoords(
        geocoded
          ? { latitude: geocoded.latitude, longitude: geocoded.longitude }
          : null,
      );
      setGeneratedNumDays(spontaneous ? 1 : numDays);
      setGeneratedStyle(planStyle);

      if (loadingInterval.current) clearInterval(loadingInterval.current);

      // Generiraj tekstualni plan
      let planText = `🗺️ PLAN PUTOVANJA — ${destination.toUpperCase()}\n\n`;
      for (let d = 0; d < (spontaneous ? 1 : numDays); d++) {
        const now = new Date();
        const activities = getTimeBasedActivities(
          venues,
          d,
          geocoded
            ? { latitude: geocoded.latitude, longitude: geocoded.longitude }
            : null,
          t,
          {
            // Spontani plan ("zatekao sam se u gradu") kreće od trenutnog
            // vremena — dosad je i on počinjao doručkom u 08:00, pa je u
            // 16h bio neupotrebljiv.
            spontaneous,
            nowMinutes: now.getHours() * 60 + now.getMinutes(),
            // Vrsta putovanja (opušteno / kulturno / avantura) dosad se nigdje
            // nije koristila — plan je za sva tri izbora bio identičan.
            style: planStyle,
            dayCount: spontaneous ? 1 : numDays,
          },
        );
        planText += `DAN ${d + 1}\n${"─".repeat(40)}\n\n`;
        activities.forEach((act) => {
          planText += `⏰ ${act.time} – ${act.venueName} ${EMOJIS[act.venueType] || "📍"}\n`;
          planText += `💬 Zašto: ${act.description}\n`;
          if (act.travelMinutes > 0)
            planText += `🚶 Put: ~${act.travelMinutes} min od prethodne postaje\n`;
          planText += `⏱️ Trajanje: ${act.duration} min\n`;
          planText += `💶 Trošak: ~${act.cost} EUR\n\n`;
        });
        planText += `💰 Ukupno dan ${d + 1}: ~${activities.reduce((sum, a) => sum + parseInt(a.cost.split("-")[0] || "10"), 0)}-${activities.reduce((sum, a) => sum + parseInt(a.cost.split("-")[1] || "30"), 0)} EUR\n`;
        planText += `💡 Savjet: Preporučujemo rezervaciju restorana unaprijed!\n\n`;
      }
      planText += `✨ Ugodan boravak u ${destination}!`;
      setResult(planText);

      setStep("result");
    } catch (err) {
      if (runId !== generationIdRef.current) return;
      if (loadingInterval.current) clearInterval(loadingInterval.current);
      Alert.alert(t("common.error"), t("plan.planError"));
      setStep("form");
    } finally {
      // Samo tekući pokušaj otpušta "zaključavanje"; zastarjeli ga ne dira.
      if (runId === generationIdRef.current) generatingRef.current = false;
    }
  }, [
    destination,
    locationValid,
    activityRadius,
    interests,
    spontaneous,
    numDays,
    // planStyle je nedostajao: povratni poziv je pamtio STARI stil pa je plan
    // bio generiran s prethodno odabranim, a ne s trenutnim.
    planStyle,
    t,
  ]);

  /**
   * Pokaži mjesto iz popisa na karti, zajedno s korisnikom.
   *
   * fitToCoordinates umjesto animateToRegion: bitno je vidjeti OBOJE — i
   * mjesto i sebe — jer se na temelju toga bira kamo ići. Kad položaj
   * korisnika nije poznat, karta se samo približi mjestu.
   */
  const showVenueOnMap = (venue: {
    name: string;
    latitude: number;
    longitude: number;
    address?: string;
  }) => {
    setPreviewVenue(venue);
    pageScrollRef.current?.scrollTo({ y: 0, animated: true });

    const target = { latitude: venue.latitude, longitude: venue.longitude };
    if (userLocation) {
      mapRef.current?.fitToCoordinates([userLocation, target], {
        edgePadding: { top: 80, right: 80, bottom: 80, left: 80 },
        animated: true,
      });
    } else {
      mapRef.current?.animateToRegion(
        { ...target, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500,
      );
    }
  };

  const openVenueDetail = (activity: DayActivity) => {
    if (!activity.venue) return;
    setSelectedPlace({
      id: `plan_${activity.venueType}_${activity.venue.name}`,
      name: activity.venue.name,
      latitude: activity.venue.latitude,
      longitude: activity.venue.longitude,
      type: activity.venueType as Place["type"],
      address: activity.venue.address,
    });
    setShowDetailModal(true);
  };

  const handleToggleInterest = React.useCallback((id: string) => {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // ---------------------------------------------------------------------------
  // Render — LOADING
  // ---------------------------------------------------------------------------
  if (step === "loading") {
    return (
      <Modal
        visible={visible}
        animationType="slide"
        transparent={false}
        onRequestClose={handleClose}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: DC.bg,
            justifyContent: "center",
            alignItems: "center",
            padding: 32,
          }}
        >
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={{ fontSize: 48, marginTop: 24 }}>
            {LOADING_MESSAGES[loadingStep].icon}
          </Text>
          <Text
            style={{
              fontSize: T.title,
              fontWeight: "700",
              color: DC.text,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {LOADING_MESSAGES[loadingStep].text}
          </Text>
          <ProgressBar step={loadingStep} total={LOADING_MESSAGES.length} />
          <Text
            style={{
              fontSize: T.meta,
              color: DC.textDim,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {t("plan.findingPlaces", { destination })}
          </Text>
        </View>
      </Modal>
    );
  }

  // ---------------------------------------------------------------------------
  // Render — RESULT
  // ---------------------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <View style={{ flex: 1, backgroundColor: DC.bg }}>
        {/* HEADER */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 20,
            paddingTop: Platform.OS === "ios" ? 54 : 36,
            borderBottomWidth: 1.5,
            borderBottomColor: DC.border,
            backgroundColor: DC.bg,
          }}
        >
          {/* Na ekranu forme naslov zauzima svu slobodnu širinu, pa gumb
              "Zatvori" ide skroz uz desni rub (i ostaje okomito centriran
              zbog alignItems: "center" na retku). Prije nijedna strana nije
              imala flex, pa su naslov i gumb stajali jedan do drugoga i
              gumb je izgledao zalijepljen uz naslov. Na ekranu rezultata
              raspored ostaje kakav je bio — ondje sredinu drži naziv
              destinacije. */}
          <View style={{ flex: step === "result" ? 0 : 1, flexShrink: 1 }}>
            {step === "result" ? (
              <TouchableOpacity onPress={() => setStep("form")}>
                <Text
                  style={{
                    fontSize: T.body,
                    color: DC.accent,
                    fontWeight: "700",
                  }}
                  numberOfLines={1}
                >
                  {t("plan.newPlan")}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text
                style={{ fontSize: T.title, fontWeight: "800", color: DC.text }}
                numberOfLines={1}
              >
                {t("plan.planTrip")}
              </Text>
            )}
          </View>

          {step === "result" && (
            <Text
              style={{
                flex: 1,
                fontSize: T.lead,
                fontWeight: "800",
                color: DC.text,
                textAlign: "center",
                marginHorizontal: 8,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {destination}
            </Text>
          )}

          {step === "result" ? (
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <TouchableOpacity
                onPress={() => Share.share({ message: result }).catch(() => {})}
              >
                <Text
                  style={{
                    fontSize: T.body,
                    color: DC.textDim,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {t("plan.share")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleClose}>
                <Text
                  style={{
                    fontSize: T.body,
                    color: DC.textDim,
                    fontWeight: "600",
                  }}
                  numberOfLines={1}
                >
                  {t("common.close")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={handleClose} style={{ flexShrink: 0 }}>
              <Text
                style={{
                  fontSize: T.body,
                  color: DC.textDim,
                  fontWeight: "600",
                }}
                numberOfLines={1}
              >
                {t("common.close")}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ========== FORMA ========== */}
        {step === "form" && (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            // FIX: na Androidu je ovdje stajao behavior="height". Aplikacija radi u
            // edge-to-edge načinu i sustav sam smanjuje prozor kad se otvori tipkovnica,
            // pa je KeyboardAvoidingView smanjivao visinu JOŠ JEDNOM. Dvije se prilagodbe
            // natežu oko visine ekrana kroz cijelu animaciju tipkovnice, što se vidi kao
            // neprekidno treperenje/vibriranje cijelog ekrana. Na Androidu zato nema
            // behaviora — sustav to odradi sam. (Unutar <Modal>-a KeyboardAvoidingView
            // ionako ne radi jer je modal zaseban prozor bez adjustResize; ondje se
            // koristi useInputBottomOffset iz hooks/use-keyboard-offset.)
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView
              contentContainerStyle={{ paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              style={{ backgroundColor: DC.bg }}
            >
              {/* SPONTANO */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  margin: 16,
                  marginBottom: 8,
                  padding: 14,
                  backgroundColor: spontaneous ? DC.gold + "22" : DC.card,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: spontaneous ? DC.gold : DC.borderDim,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: T.body,
                      fontWeight: "700",
                      color: DC.text,
                    }}
                  >
                    {t("plan.spontaneous")}
                  </Text>
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.textDim,
                      marginTop: 2,
                    }}
                  >
                    {t("plan.spontaneousDesc")}
                  </Text>
                </View>
                <TouchableOpacity
                  style={{
                    width: 50,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: spontaneous ? DC.gold : DC.borderDim,
                    justifyContent: "center",
                    paddingHorizontal: 3,
                    alignItems: spontaneous ? "flex-end" : "flex-start",
                  }}
                  onPress={() => {
                    const next = !spontaneous;
                    setSpontaneous(next);
                    if (next) setNumDays(1);
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: "#fff",
                    }}
                  />
                </TouchableOpacity>
              </View>

              {/* DESTINACIJA */}
              <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 6,
                  }}
                >
                  {t("plan.whereGoing")}?
                </Text>
                <View
                  style={{ position: "relative", justifyContent: "center" }}
                >
                  <TextInput
                    selectTextOnFocus
                    style={{
                      backgroundColor: DC.card,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: locationValid ? "#4CAF50" : DC.inputBorder,
                      paddingHorizontal: 16,
                      paddingVertical: 13,
                      paddingRight: 40,
                      fontSize: T.lead,
                      color: DC.text,
                      fontWeight: "600",
                    }}
                    placeholder={t("plan.destinationExample")}
                    placeholderTextColor={DC.textDim}
                    value={destination}
                    onChangeText={searchDestination}
                    autoCapitalize="words"
                  />
                  {searchingLocation && (
                    <ActivityIndicator
                      size="small"
                      color={DC.textDim}
                      style={{ position: "absolute", right: 14 }}
                    />
                  )}
                  {!searchingLocation && locationValid && (
                    <Text
                      style={{
                        position: "absolute",
                        right: 14,
                        color: "#4CAF50",
                        fontSize: T.title,
                        fontWeight: "700",
                      }}
                    >
                      ✓
                    </Text>
                  )}
                </View>
                {!locationValid && destination.trim().length > 0 && (
                  <Text
                    style={{
                      fontSize: T.meta,
                      color: DC.textDim,
                      marginTop: 6,
                    }}
                  >
                    {t("plan.destinationPickFromList")}
                  </Text>
                )}
                {showLocationSuggestions && (
                  <View
                    style={{
                      backgroundColor: DC.card,
                      borderWidth: 1,
                      borderColor: DC.inputBorder,
                      borderRadius: 10,
                      marginTop: 4,
                      maxHeight: 220,
                      overflow: "hidden",
                    }}
                  >
                    <ScrollView
                      keyboardShouldPersistTaps="handled"
                      nestedScrollEnabled
                    >
                      {locationSuggestions.map((s, idx) => (
                        <TouchableOpacity
                          key={`${s.lat}_${s.lon}_${idx}`}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 12,
                            borderBottomWidth:
                              idx < locationSuggestions.length - 1 ? 1 : 0,
                            borderBottomColor: DC.inputBorder,
                          }}
                          onPress={() => selectDestination(s)}
                        >
                          <Text style={{ color: DC.text, fontSize: T.body }}>
                            {s.displayName}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* KOLIKO DANA */}
              {!spontaneous && (
                <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                  <Text
                    style={{
                      fontSize: T.meta,
                      fontWeight: "700",
                      color: DC.textSub,
                      marginBottom: 10,
                    }}
                  >
                    {t("plan.howManyDays")}?
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}
                  >
                    {[
                      {
                        val: 1,
                        label: t("plan.day1Label", { defaultValue: "1 dan" }),
                      },
                      {
                        val: 2,
                        label: t("plan.weekendLabel", {
                          defaultValue: "Vikend",
                        }),
                      },
                      {
                        val: 3,
                        label: t("plan.days3Label", { defaultValue: "3 dana" }),
                      },
                      {
                        val: 5,
                        label: t("plan.weekLabel", { defaultValue: "Tjedan" }),
                      },
                      {
                        val: 7,
                        label: t("plan.days7Label", { defaultValue: "7 dana" }),
                      },
                    ].map((o) => (
                      <TouchableOpacity
                        key={o.val}
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 10,
                          backgroundColor:
                            numDays === o.val ? DC.cardHover : DC.card,
                          borderWidth: 1.5,
                          borderColor:
                            numDays === o.val ? DC.border : DC.borderDim,
                        }}
                        onPress={() => setNumDays(o.val)}
                      >
                        <Text
                          style={{
                            fontSize: T.body,
                            fontWeight: numDays === o.val ? "700" : "400",
                            color: numDays === o.val ? DC.text : DC.textDim,
                          }}
                        >
                          {o.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* STIL */}
              <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 10,
                  }}
                >
                  {t("plan.tripStyle")}?
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {[
                    {
                      val: "opusteno" as PlanStyle,
                      icon: APP_ICONS.styleRelaxed,
                      label: t("plan.styleRelaxed"),
                    },
                    {
                      val: "kulturno" as PlanStyle,
                      icon: APP_ICONS.styleCultural,
                      label: t("plan.styleCultural"),
                    },
                    {
                      val: "avantura" as PlanStyle,
                      icon: APP_ICONS.styleAdventure,
                      label: t("plan.styleAdventure"),
                    },
                  ].map((o) => (
                    <TouchableOpacity
                      key={o.val}
                      style={{
                        flex: 1,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                        backgroundColor:
                          planStyle === o.val ? DC.cardHover : DC.card,
                        borderWidth: 1.5,
                        borderColor:
                          planStyle === o.val ? DC.border : DC.borderDim,
                      }}
                      onPress={() => setPlanStyle(o.val)}
                    >
                      <Image
                        source={o.icon}
                        style={{ width: 44, height: 44, marginBottom: 6 }}
                        resizeMode="contain"
                      />
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: planStyle === o.val ? "700" : "500",
                          color: planStyle === o.val ? DC.text : DC.textDim,
                        }}
                      >
                        {o.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* NAPREDNO */}
              <TouchableOpacity
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginHorizontal: 16,
                  marginTop: 20,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  backgroundColor: DC.card,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                }}
                onPress={() => setShowAdvanced((v) => !v)}
              >
                <Text
                  style={{
                    fontSize: T.meta,
                    color: DC.textSub,
                    fontWeight: "600",
                  }}
                >
                  {t("plan.advancedOptions")}
                </Text>
                <Text style={{ fontSize: T.meta, color: DC.textDim }}>
                  {showAdvanced
                    ? t("plan.advancedHide")
                    : t("plan.advancedShow")}
                </Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View
                  style={{
                    marginHorizontal: 16,
                    padding: 14,
                    backgroundColor: DC.card,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DC.borderDim,
                    borderTopWidth: 0,
                    borderTopLeftRadius: 0,
                    borderTopRightRadius: 0,
                    gap: 16,
                  }}
                >
                  {/* S KIM */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.withWhom")}?
                    </Text>
                    <View style={{ gap: 8 }}>
                      {[
                        {
                          val: "solo" as CompanionType,
                          icon: APP_ICONS.solo,
                          label: t("plan.companionSolo"),
                          emoji: "🧍",
                          desc: t("plan.companionSoloDesc"),
                        },
                        {
                          val: "partner" as CompanionType,
                          icon: APP_ICONS.partner,
                          label: t("plan.companionPartner"),
                          emoji: "💑",
                          desc: t("plan.companionPartnerDesc"),
                        },
                        {
                          val: "prijatelji" as CompanionType,
                          icon: APP_ICONS.prijatelji,
                          label: t("plan.companionFriends"),
                          emoji: "👯",
                          desc: t("plan.companionFriendsDesc"),
                        },
                        {
                          val: "obitelj" as CompanionType,
                          icon: APP_ICONS.obitelj,
                          label: t("plan.companionFamily"),
                          emoji: "👨‍👩‍👧‍👦",
                          desc: t("plan.companionFamilyDesc"),
                        },
                      ].map((o) => (
                        <TouchableOpacity
                          key={o.val}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingHorizontal: 14,
                            paddingVertical: 10,
                            borderRadius: 10,
                            backgroundColor:
                              companions === o.val ? DC.cardHover : DC.bg,
                            borderWidth: 1.5,
                            borderColor:
                              companions === o.val ? DC.border : DC.borderDim,
                            gap: 10,
                          }}
                          onPress={() =>
                            setCompanions((prev) =>
                              prev === o.val ? null : o.val,
                            )
                          }
                        >
                          {o.icon ? (
                            <Image
                              source={o.icon}
                              style={{ width: 40, height: 40 }}
                              resizeMode="contain"
                            />
                          ) : (
                            <Text style={{ fontSize: T.screen }}>
                              {o.emoji}
                            </Text>
                          )}
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: T.meta,
                                fontWeight:
                                  companions === o.val ? "700" : "500",
                                color:
                                  companions === o.val ? DC.text : DC.textDim,
                              }}
                            >
                              {o.label}
                            </Text>
                            <Text
                              style={{ fontSize: T.caption, color: DC.textDim }}
                            >
                              {o.desc}
                            </Text>
                          </View>
                          {companions === o.val && (
                            <Text
                              style={{ fontSize: T.lead, color: DC.accent }}
                            >
                              ✓
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* PRIJEVOZ */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.transportLabel")}
                    </Text>
                    <View
                      style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                    >
                      {[
                        {
                          val: "auto" as TransportType,
                          label: t("plan.car"),
                          icon: APP_ICONS.auto,
                        },
                        {
                          val: "javni" as TransportType,
                          label: t("plan.public"),
                          icon: APP_ICONS.javni,
                        },
                        {
                          val: "pjesice" as TransportType,
                          label: t("plan.walking"),
                          icon: APP_ICONS.pjesice,
                        },
                        {
                          val: "bicikl" as TransportType,
                          label: t("plan.bicycle"),
                          icon: APP_ICONS.bicikl,
                        },
                      ].map((o) => (
                        <TouchableOpacity
                          key={o.val}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor:
                              transport === o.val ? DC.cardHover : DC.bg,
                            borderWidth: 1,
                            borderColor:
                              transport === o.val ? DC.border : DC.borderDim,
                          }}
                          onPress={() =>
                            setTransport((prev) =>
                              prev === o.val ? null : o.val,
                            )
                          }
                        >
                          {o.icon && (
                            <Image
                              source={o.icon}
                              style={{ width: 28, height: 28 }}
                              resizeMode="contain"
                            />
                          )}
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: transport === o.val ? "700" : "400",
                              color: transport === o.val ? DC.text : DC.textDim,
                            }}
                          >
                            {o.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* BUDŽET */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.budgetLabel")}
                    </Text>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: DC.bg,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: DC.inputBorder,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        gap: 8,
                      }}
                    >
                      <Text style={{ fontSize: T.lead, color: DC.textDim }}>
                        €
                      </Text>
                      <TextInput
                        selectTextOnFocus
                        style={{
                          flex: 1,
                          fontSize: T.lead,
                          fontWeight: "600",
                          color: DC.text,
                          padding: 0,
                        }}
                        placeholder={t("plan.budgetPlaceholder")}
                        placeholderTextColor={DC.textDim}
                        value={budget}
                        onChangeText={(v) =>
                          setBudget(v.replace(/[^0-9]/g, ""))
                        }
                        keyboardType="numeric"
                        maxLength={6}
                      />
                      <Text style={{ fontSize: T.meta, color: DC.textDim }}>
                        EUR
                      </Text>
                    </View>
                  </View>

                  {/* RADIJUS */}
                  <View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: DC.textSub,
                        marginBottom: 8,
                      }}
                    >
                      {t("plan.radiusLabel")}
                    </Text>
                    <View
                      style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}
                    >
                      {[2, 5, 10, 20].map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 8,
                            borderRadius: 8,
                            backgroundColor:
                              activityRadius === r ? DC.cardHover : DC.bg,
                            borderWidth: 1,
                            borderColor:
                              activityRadius === r ? DC.border : DC.borderDim,
                          }}
                          onPress={() =>
                            setActivityRadius((prev) => (prev === r ? null : r))
                          }
                        >
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: activityRadius === r ? "700" : "400",
                              color:
                                activityRadius === r ? DC.text : DC.textDim,
                            }}
                          >
                            {r} km
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* INTERESI */}
                  <View>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: "700",
                          color: DC.textSub,
                        }}
                      >
                        {t("plan.interestsLabel")}
                      </Text>
                      {interests.length > 0 && (
                        <TouchableOpacity onPress={() => setInterests([])}>
                          <Text
                            style={{
                              fontSize: T.meta,
                              color: DC.accent,
                              fontWeight: "600",
                            }}
                          >
                            {t("plan.clearInterestsBtn")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <InterestiGrid
                      interests={interests}
                      onToggle={handleToggleInterest}
                      DC={DC}
                      t={t}
                    />
                  </View>
                </View>
              )}

              {/* GUMB GENERIRAJ */}
              <TouchableOpacity
                style={{
                  margin: 16,
                  marginTop: 24,
                  backgroundColor: DC.cardHover,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: DC.border,
                  paddingVertical: 18,
                  alignItems: "center",
                }}
                onPress={generate}
              >
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.lead,
                    fontWeight: "800",
                  }}
                >
                  {spontaneous ? t("plan.discoverBtn") : t("plan.generateBtn")}
                </Text>
                <Text
                  style={{ color: DC.textDim, fontSize: T.meta, marginTop: 4 }}
                >
                  {t("plan.generateSubtitle")}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ========== REZULTAT ========== */}
        {step === "result" && (
          <ScrollView
            ref={pageScrollRef}
            contentContainerStyle={{ paddingBottom: 60 }}
          >
            {/* Što su drugi objavili u ovom gradu — plan govori kamo ići,
                ovo pokazuje kako to izgleda i što se sprema. */}
            {geocodedCoords && (
              <TouchableOpacity
                style={{
                  marginHorizontal: 16,
                  marginTop: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                  backgroundColor: DC.card,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
                onPress={() => setAreaSheetOpen(true)}
              >
                <Text style={{ fontSize: T.title }}>📣</Text>
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.body,
                    fontWeight: "700",
                  }}
                >
                  {t("area.openFromPlan")}
                </Text>
              </TouchableOpacity>
            )}
            {/* KARTA */}

            {/* PRE-LOAD IKONA — skriveni View koji inicijalizira sve Image komponente */}
            <View
              style={{ position: "absolute", width: 0, height: 0, opacity: 0 }}
            >
              {Object.entries(MARKER_IMAGES).map(([key, src]) => (
                <Image key={key} source={src} style={{ width: 1, height: 1 }} />
              ))}
            </View>
            {geocodedCoords && activeDayActivities.length > 0 && (
              <View style={{ margin: 16, borderRadius: 16 }}>
                {/* AKTIVAN STOP BANNER — overlay iznad karte */}
                {activeDayActivities[activeStop] && (
                  <View
                    style={{
                      position: "absolute",
                      top: 12,
                      left: 12,
                      right: 12,
                      zIndex: 10,
                      backgroundColor: isDark
                        ? "rgba(20,30,20,0.95)"
                        : "rgba(255,255,255,0.95)",
                      borderRadius: 12,
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      shadowColor: "#000",
                      shadowOpacity: 0.15,
                      shadowRadius: 8,
                      elevation: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor:
                          ROUTE_COLORS[activeDay % ROUTE_COLORS.length],
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: T.meta,
                          fontWeight: "700",
                        }}
                      >
                        {activeStop + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: T.meta,
                          fontWeight: "700",
                          color: DC.text,
                        }}
                        numberOfLines={1}
                      >
                        {activeDayActivities[activeStop].venueName}{" "}
                      </Text>
                      {/* Vrijeme puta od prethodne postaje. Plan bira mjesta
                          po blizini i to je oduvijek racunao — ali dosad nije
                          pokazivao, pa korisnik nije imao po cemu prosuditi
                          je li redoslijed smislen ili nasumican. */}
                      <Text style={{ fontSize: T.caption, color: DC.textSub }}>
                        {activeDayActivities[activeStop].description}
                        {" • "}
                        {activeDayActivities[activeStop].duration} min
                        {" • "}
                        {activeStop === 0 ||
                        !activeDayActivities[activeStop].travelMinutes
                          ? t("plan.firstStop")
                          : t("plan.travelFromPrevious", {
                              min: activeDayActivities[activeStop]
                                .travelMinutes,
                            })}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontSize: T.meta,
                        fontWeight: "700",
                        color: ROUTE_COLORS[activeDay % ROUTE_COLORS.length],
                      }}
                    >
                      {activeDayActivities[activeStop].time}
                    </Text>
                  </View>
                )}
                <MapView
                  ref={mapRef}
                  style={{ height: 380 }}
                  initialRegion={{
                    latitude: geocodedCoords.latitude,
                    longitude: geocodedCoords.longitude,
                    latitudeDelta: 0.02,
                    longitudeDelta: 0.02,
                  }}
                  onMapReady={() => setMapReady(true)}
                  toolbarEnabled={false} // ← uklanja Google Maps toolbar s ikonama
                  moveOnMarkerPress={false}
                >
                  {userLocation && (
                    <Marker
                      coordinate={userLocation}
                      tracksViewChanges={false}
                      anchor={{ x: 0.5, y: 0.5 }}
                    >
                      <Image
                        source={putnikIcon}
                        style={{ width: 48, height: 48 }}
                        resizeMode="contain"
                        fadeDuration={0}
                      />
                    </Marker>
                  )}

                  {(() => {
                    const color = ROUTE_COLORS[activeDay % ROUTE_COLORS.length];
                    const routeCoords = [
                      ...(userLocation ? [userLocation] : [geocodedCoords]),
                      ...activeDayActivities
                        .filter((a) => a.venue)
                        .map((a) => ({
                          latitude: a.venue!.latitude,
                          longitude: a.venue!.longitude,
                        })),
                    ];
                    const validCoords = routeCoords.filter(
                      (c) =>
                        c &&
                        typeof c.latitude === "number" &&
                        typeof c.longitude === "number",
                    );

                    return (
                      <>
                        {validCoords.length > 1 && (
                          <Polyline
                            coordinates={validCoords}
                            strokeColor={color}
                            strokeWidth={4}
                          />
                        )}
                        {activeDayActivities.map((activity, idx) => (
                          <SimpleMarker
                            key={`marker_${idx}`}
                            activity={activity}
                            color={color}
                            isActive={
                              activeStop === idx && activity.venue !== null
                            }
                            isCompleted={completedStops.has(idx)}
                            onPress={() => {
                              if (activity.venue) {
                                setActiveStop(idx);
                                openVenueDetail(activity);
                              }
                            }}
                          />
                        ))}
                      </>
                    );
                  })()}

                  {/* Mjesto koje korisnik upravo razgledava iz popisa. */}
                  {previewVenue && (
                    <Marker
                      coordinate={{
                        latitude: previewVenue.latitude,
                        longitude: previewVenue.longitude,
                      }}
                      title={previewVenue.name}
                      description={previewVenue.address}
                      pinColor="#f2c14e"
                    />
                  )}
                </MapView>

                {/* SELEKTOR DANA (samo ako više od 1 dana) */}
                {generatedNumDays > 1 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{
                      backgroundColor: DC.card,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", gap: 6 }}>
                      {Array.from({
                        length: Math.min(generatedNumDays, 7),
                      }).map((_, i) => (
                        <TouchableOpacity
                          key={i}
                          style={{
                            paddingHorizontal: 14,
                            paddingVertical: 6,
                            borderRadius: 16,
                            backgroundColor:
                              activeDay === i
                                ? ROUTE_COLORS[i % ROUTE_COLORS.length]
                                : DC.bg,
                            borderWidth: 1.5,
                            borderColor: ROUTE_COLORS[i % ROUTE_COLORS.length],
                          }}
                          onPress={() => setActiveDay(i)}
                        >
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: "700",
                              color:
                                activeDay === i
                                  ? "#fff"
                                  : ROUTE_COLORS[i % ROUTE_COLORS.length],
                            }}
                          >
                            {t("plan.dayLabel2", { day: i + 1 })}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                )}

                {/* HORIZONTALNI SCROLL STOPOVA */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{
                    backgroundColor: DC.card,
                    paddingVertical: 8,
                    paddingHorizontal: 6,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 6,
                      alignItems: "flex-start",
                    }}
                  >
                    {activeDayActivities.map((act, i) => {
                      const isAct = activeStop === i;
                      const isDone = completedStops.has(i);
                      const color =
                        ROUTE_COLORS[activeDay % ROUTE_COLORS.length];
                      const bc = isDone
                        ? "#34c759"
                        : isAct
                          ? color
                          : DC.borderDim;
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setActiveStop(i)}
                          style={{
                            width: 76,
                            height: 76, // ← fiksna visina — svi isti
                            borderRadius: 10,
                            padding: 8,
                            backgroundColor: isAct
                              ? color + "18"
                              : isDone
                                ? "#34c75910"
                                : DC.bg,
                            borderWidth: 1.5,
                            borderColor: bc,
                            alignItems: "center",
                            justifyContent: "center", // ← vertikalno centrirano
                          }}
                        >
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              backgroundColor: bc,
                              justifyContent: "center",
                              alignItems: "center",
                              marginBottom: 4,
                            }}
                          >
                            <Text
                              style={{
                                color: "#fff",
                                fontSize: 9,
                                fontWeight: "900",
                              }}
                            >
                              {isDone ? "✓" : i + 1}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 10,
                              color: DC.textDim,
                              marginBottom: 2,
                            }}
                          >
                            {act.time}
                          </Text>
                          {/* ← UKLONJENO: emoji ikona kategorije */}
                          <Text
                            style={{
                              fontSize: 9,
                              color: DC.text,
                              fontWeight: "600",
                              textAlign: "center",
                              lineHeight: 12,
                            }}
                            numberOfLines={2}
                          >
                            {act.venueName}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* PROGRESS PILL — ispod scroll trake, iznad opisa */}
            <View
              style={{
                backgroundColor: isDark
                  ? "rgba(20,30,20,0.85)"
                  : "rgba(255,255,255,0.88)",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 6,
                alignSelf: "flex-end",
                marginTop: 6,
                marginRight: 4,
                marginBottom: 2,
              }}
            >
              <Text style={{ fontSize: T.caption, color: DC.textSub }}>
                {t("plan.stopOf", {
                  current: activeStop + 1,
                  total: activeDayActivities.length,
                })}
              </Text>
            </View>

            {/* OPIS PUTA */}
            <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: T.meta,
                  fontWeight: "700",
                  color: DC.textSub,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 10,
                }}
              >
                {" "}
                {generatedNumDays > 1
                  ? t("plan.dayPlanLabel", { day: activeDay + 1 })
                  : t("plan.hourlyPlan")}
              </Text>

              <View
                style={{
                  backgroundColor: DC.card,
                  borderRadius: 16,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                }}
              >
                {activeDayActivities.map((activity, idx) => {
                  const color = ROUTE_COLORS[activeDay % ROUTE_COLORS.length];
                  const isActive = activeStop === idx;
                  const isCompleted = completedStops.has(idx);
                  const hasVenue = activity.venue !== null;
                  const isVenueAlreadyVisited = activity.venue
                    ? isVenueVisited(activity.venue, activity.venueType)
                    : false;

                  return (
                    <TouchableOpacity
                      key={`desc_${idx}`}
                      activeOpacity={hasVenue ? 0.65 : 1}
                      onPress={() => {
                        if (hasVenue) {
                          setActiveStop(idx);
                          openVenueDetail(activity);
                        }
                      }}
                      style={{
                        backgroundColor: isActive
                          ? color + "28"
                          : isCompleted || isVenueAlreadyVisited
                            ? "#34c75918"
                            : hasVenue
                              ? color + "12"
                              : DC.bg,
                        borderRadius: 12,
                        padding: 12,
                        marginBottom: 8,
                        borderLeftWidth: 4,
                        borderLeftColor: isCompleted ? "#34c759" : color,
                        borderWidth: isActive ? 2 : 0.5,
                        borderColor: isActive ? color + "88" : DC.borderDim,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      {/* BROJ */}
                      <View style={{ alignItems: "center", gap: 3 }}>
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor:
                              isCompleted || isVenueAlreadyVisited
                                ? "#34c759"
                                : color,
                            justifyContent: "center",
                            alignItems: "center",
                            borderWidth: 2,
                            borderColor: isActive ? "#fff" : "transparent",
                          }}
                        >
                          <Text
                            style={{
                              color: "#fff",
                              fontSize: T.meta,
                              fontWeight: "900",
                            }}
                          >
                            {isCompleted || isVenueAlreadyVisited
                              ? "✓"
                              : idx + 1}
                          </Text>
                        </View>
                        {isActive && <PulsingDot color={color} />}
                      </View>

                      {/* TEKST */}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: T.meta,
                            fontWeight: "700",
                            color: DC.text,
                          }}
                        >
                          {activity.time} – {activity.venueName}{" "}
                        </Text>
                        <Text
                          style={{
                            fontSize: T.caption,
                            color: DC.textSub,
                            marginTop: 2,
                          }}
                        >
                          {activity.description}
                        </Text>
                        <Text
                          style={{ fontSize: T.caption, color: DC.textSub }}
                        >
                          {activity.duration} min • ~{activity.cost} EUR
                        </Text>
                      </View>

                      {/* DUGME OTVORI */}
                      {hasVenue && !(isCompleted || isVenueAlreadyVisited) && (
                        <View
                          style={{
                            backgroundColor: isActive ? color : color + "CC",
                            borderRadius: 10,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: T.caption,
                              color: "#fff",
                              fontWeight: "800",
                            }}
                          >
                            {t("plan.open")} →
                          </Text>
                        </View>
                      )}

                      {/* OBIŠAO GUMB */}
                      {hasVenue &&
                        isActive &&
                        !isCompleted &&
                        !isVenueAlreadyVisited && (
                          <TouchableOpacity
                            style={{
                              backgroundColor: "#34c759",
                              borderRadius: 10,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                            }}
                            onPress={async (e) => {
                              e.stopPropagation();
                              if (activity.venue) {
                                await handleMarkVisited(
                                  activity.venue,
                                  activity.venueType,
                                );
                                setCompletedStops(
                                  (prev) => new Set([...prev, idx]),
                                );
                                if (idx + 1 < activeDayActivities.length) {
                                  setActiveStop(idx + 1);
                                }
                              }
                            }}
                          >
                            <Text
                              style={{
                                fontSize: T.caption,
                                color: "#fff",
                                fontWeight: "900",
                              }}
                            >
                              {t("plan.visitedMark")} ✓
                            </Text>
                          </TouchableOpacity>
                        )}

                      {/* VEĆ POSJEĆENO */}
                      {(isCompleted || isVenueAlreadyVisited) && (
                        <View
                          style={{
                            backgroundColor: "#34c75922",
                            borderRadius: 10,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderWidth: 1,
                            borderColor: "#34c759",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: T.caption,
                              color: "#34c759",
                              fontWeight: "800",
                            }}
                          >
                            ✓ {t("plan.visitedDone")}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* MJESTA PO KATEGORIJAMA */}
            {Object.keys(allVenues).length > 0 && (
              <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    color: DC.textSub,
                    marginBottom: 10,
                  }}
                >
                  {t("plan.allFoundPlaces")}
                </Text>
                {Object.entries(allVenues).map(([type, options]) => {
                  const cat =
                    placeCategories[type as keyof typeof placeCategories];
                  const color = cat?.color || "#667eea";
                  const visitedCount = options.filter((v) =>
                    isVenueVisited(v, type),
                  ).length;
                  const isOpen = expandedCategories.has(type);

                  return (
                    <View
                      key={type}
                      style={{
                        backgroundColor: DC.card,
                        borderRadius: 12,
                        marginBottom: 8,
                        borderWidth: 1,
                        borderColor: DC.borderDim,
                        overflow: "hidden",
                      }}
                    >
                      <TouchableOpacity
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          padding: 12,
                          gap: 10,
                          backgroundColor: color + "15",
                        }}
                        onPress={() =>
                          setExpandedCategories((prev) => {
                            const next = new Set(prev);
                            next.has(type) ? next.delete(type) : next.add(type);
                            return next;
                          })
                        }
                      >
                        {MARKER_IMAGES[type] ? (
                          <Image
                            source={MARKER_IMAGES[type]}
                            style={{ width: 40, height: 40 }}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={{ fontSize: T.screen }}>
                            {EMOJIS[type] || "📍"}
                          </Text>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: T.meta,
                              fontWeight: "700",
                              color: DC.text,
                            }}
                          >
                            {t(`categories.${type}`, { defaultValue: type })}
                          </Text>
                          <Text
                            style={{ fontSize: T.caption, color: DC.textDim }}
                          >
                            {options.length} {t("plan.placesWord")}
                            {visitedCount > 0
                              ? ` · ✓ ${visitedCount} ${t("plan.visitedWord")}`
                              : ""}
                          </Text>
                        </View>
                        <Text
                          style={{ fontSize: T.meta, color, fontWeight: "700" }}
                        >
                          {isOpen ? "▲" : "▼"}
                        </Text>
                      </TouchableOpacity>

                      {isOpen &&
                        options.map((venue, idx) => {
                          const visited = isVenueVisited(venue, type);
                          const dist = geocodedCoords
                            ? haversineKm(
                                geocodedCoords.latitude,
                                geocodedCoords.longitude,
                                venue.latitude,
                                venue.longitude,
                              )
                            : null;
                          return (
                            <View
                              key={idx}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                padding: 12,
                                borderTopWidth: 1,
                                borderTopColor: DC.borderDim,
                                gap: 10,
                                backgroundColor: visited
                                  ? "#34c75908"
                                  : "transparent",
                              }}
                            >
                              <View
                                style={{
                                  width: 26,
                                  height: 26,
                                  borderRadius: 13,
                                  backgroundColor: visited
                                    ? "#34c75922"
                                    : color + "22",
                                  borderWidth: 1,
                                  borderColor: visited ? "#34c759" : color,
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "800",
                                    color: visited ? "#34c759" : color,
                                  }}
                                >
                                  {visited ? "✓" : idx + 1}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={{ flex: 1 }}
                                // Dugi pritisak otvara pune detalje mjesta.
                                onLongPress={() => {
                                  setSelectedPlace({
                                    id: `plan_${type}_${venue.name}`,
                                    name: venue.name,
                                    latitude: venue.latitude,
                                    longitude: venue.longitude,
                                    type: type as Place["type"],
                                    address: venue.address,
                                  });
                                  setShowDetailModal(true);
                                }}
                                // Dodir pokazuje mjesto na karti, jer je prvo
                                // pitanje uvijek "gdje je to u odnosu na mene".
                                onPress={() =>
                                  showVenueOnMap({
                                    name: venue.name,
                                    latitude: venue.latitude,
                                    longitude: venue.longitude,
                                    address: venue.address,
                                  })
                                }
                              >
                                <Text
                                  style={{
                                    fontSize: T.meta,
                                    fontWeight: "700",
                                    color: visited ? "#34c759" : DC.text,
                                  }}
                                  numberOfLines={1}
                                >
                                  {venue.name}
                                </Text>
                                {venue.address && (
                                  <Text
                                    style={{
                                      fontSize: T.caption,
                                      color: DC.textDim,
                                      marginTop: 1,
                                    }}
                                    numberOfLines={1}
                                  >
                                    📍 {venue.address}
                                  </Text>
                                )}
                                {dist !== null && (
                                  <Text
                                    style={{
                                      fontSize: T.caption,
                                      color: dist < 1 ? "#34c759" : color,
                                      marginTop: 1,
                                    }}
                                  >
                                    {dist < 1
                                      ? `${Math.round(dist * 1000)} m`
                                      : `${dist.toFixed(1)} km`}
                                  </Text>
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 7,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: visited ? "#34c759" : color,
                                  backgroundColor: visited
                                    ? "#34c75922"
                                    : color + "18",
                                }}
                                onPress={() => handleMarkVisited(venue, type)}
                                disabled={visited}
                              >
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "700",
                                    color: visited ? "#34c759" : color,
                                  }}
                                >
                                  {visited
                                    ? t("plan.visited2")
                                    : t("plan.markPlace")}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                    </View>
                  );
                })}
              </View>
            )}

            {/* AKCIJE */}
            <View style={{ marginHorizontal: 16, gap: 10, marginBottom: 8 }}>
              <TouchableOpacity
                style={{
                  backgroundColor: DC.cardHover,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: DC.border,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
                onPress={() => Share.share({ message: result }).catch(() => {})}
              >
                <Text
                  style={{
                    color: DC.text,
                    fontSize: T.body,
                    fontWeight: "700",
                  }}
                >
                  {t("plan.sharePlan")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  backgroundColor: DC.bg,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: DC.borderDim,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
                onPress={() => setStep("form")}
              >
                <Text
                  style={{
                    color: DC.textSub,
                    fontSize: T.body,
                    fontWeight: "600",
                  }}
                >
                  {t("plan.newPlanBtn")}
                </Text>
              </TouchableOpacity>
            </View>

            {/* OCJENA */}
            <View
              style={{
                marginHorizontal: 16,
                marginTop: 16,
                marginBottom: 32,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: T.body,
                  fontWeight: "700",
                  color: DC.text,
                  marginBottom: 10,
                }}
              >
                {t("plan.rateTitle")}
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => !ratingSubmitted && setPlanRating(n)}
                    disabled={ratingSubmitted}
                  >
                    <Text
                      style={{
                        fontSize: T.hero,
                        color: planRating >= n ? "#f39c12" : DC.borderDim,
                      }}
                    >
                      {planRating >= n ? "★" : "☆"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Poruka o grešci */}
              {ratingError && (
                <Text
                  style={{
                    color: DC.danger,
                    fontSize: T.meta,
                    marginTop: 8,
                    textAlign: "center",
                  }}
                >
                  {ratingError}
                </Text>
              )}

              {/* Gumb za slanje — prikazuje se dok nije poslano */}
              {planRating > 0 && !ratingSubmitted && (
                <TouchableOpacity
                  style={{
                    marginTop: 10,
                    paddingHorizontal: 24,
                    paddingVertical: 10,
                    backgroundColor: ratingLoading
                      ? DC.borderDim
                      : DC.cardHover,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: DC.border,
                    opacity: ratingLoading ? 0.7 : 1,
                  }}
                  onPress={submitRating}
                  disabled={ratingLoading}
                >
                  {ratingLoading ? (
                    <ActivityIndicator size="small" color={DC.text} />
                  ) : (
                    <Text style={{ color: DC.text, fontWeight: "700" }}>
                      {t("plan.rateSubmit")}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {/* Potvrda nakon uspješnog slanja — bez Alert */}
              {ratingSubmitted && (
                <View
                  style={{
                    marginTop: 12,
                    alignItems: "center",
                    backgroundColor: "#34c75918",
                    borderRadius: 10,
                    paddingHorizontal: 20,
                    paddingVertical: 10,
                    borderWidth: 1,
                    borderColor: "#34c759",
                  }}
                >
                  <Text
                    style={{
                      color: "#34c759",
                      fontWeight: "700",
                      fontSize: T.body,
                    }}
                  >
                    ✓ {t("plan.rateThankYou")}
                  </Text>
                  <Text
                    style={{
                      color: DC.textDim,
                      fontSize: T.meta,
                      marginTop: 4,
                    }}
                  >
                    {destination} · {planRating}/5 ⭐
                  </Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        {/* Objave oko grada za koji je plan napravljen. */}
        <AreaActivitiesSheet
          visible={areaSheetOpen}
          point={
            geocodedCoords
              ? {
                  name: destination || "",
                  latitude: geocodedCoords.latitude,
                  longitude: geocodedCoords.longitude,
                }
              : null
          }
          onClose={() => setAreaSheetOpen(false)}
        />

        {/* Place Detail Modal */}
        <PlaceDetailModalComponent
          place={selectedPlace}
          visible={showDetailModal}
          onClose={() => {
            setShowDetailModal(false);
            setSelectedPlace(null);
          }}
          onMarkVisited={async (p: Place) => {
            if (onMarkVisited) await onMarkVisited(p);
            setLocalVisitedIds((prev) => new Set([...prev, p.id]));
            setShowDetailModal(false);
            setSelectedPlace(null);
          }}
          onHidePlace={() => {
            setShowDetailModal(false);
            setSelectedPlace(null);
          }}
          isVisited={
            selectedPlace
              ? localVisitedIds.has(selectedPlace.id) ||
                visits.some(
                  (v) =>
                    v.placeName.toLowerCase() ===
                      (selectedPlace.name || "").toLowerCase() &&
                    v.placeType === selectedPlace.type,
                )
              : false
          }
          notifPrefs={{
            appEnabled: false,
            emailEnabled: false,
            email: "",
            categories: [],
          }}
          onToggleNotif={() => {}}
        />
      </View>
    </Modal>
  );
}
