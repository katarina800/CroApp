// app/services/googlePlacesNew.ts
//
// Google Places API (New) — https://places.googleapis.com/v1
//
// Aplikacija je koristila STARI Places API (maps.googleapis.com/maps/api/place/…).
// Google ga ne nudi novim projektima (pozivi vraćaju REQUEST_DENIED), a aplikacija
// je to prešućivala: "nema rezultata" i "ključ ne radi" izgledali su isto. Ovdje se
// poziva novi API i, što je važno, GREŠKA SE VRAĆA (i ispisuje u razvoju), pa se
// vidi zašto nema Googleovih mjesta.
//
// U Google Cloud Consoleu mora biti uključen "Places API (New)" i naplata.

const BASE = "https://places.googleapis.com/v1";

const glog = (...args: unknown[]) => {
  if (__DEV__) console.log("[google]", ...args);
};

export interface NewPlace {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  rating?: number;
  address?: string;
  businessStatus?: string;
  /** Googleov "otvoreno sada"; null kad nije poznato. */
  openNow: boolean | null;
  /** "ponedjeljak: 09:00 – 17:00" po retku, ili undefined. */
  openingHours?: string;
  phone?: string;
  /** Resursna imena fotografija: "places/ID/photos/ID". */
  photoNames: string[];
}

async function post(
  path: string,
  key: string,
  fieldMask: string,
  body: unknown,
  timeoutMs: number,
): Promise<{ data?: any; error?: string }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": fieldMask,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // tijelo nije JSON — vidi se u poruci greške ispod
    }
    if (!res.ok) {
      return {
        error: `HTTP ${res.status}: ${data?.error?.message ?? text.slice(0, 200)}`,
      };
    }
    return { data: data ?? {} };
  } catch (e) {
    return { error: String(e) };
  } finally {
    clearTimeout(id);
  }
}

function toNewPlace(p: any): NewPlace | null {
  const lat = p?.location?.latitude;
  const lon = p?.location?.longitude;
  const name = p?.displayName?.text;
  if (!p?.id || !name || typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }
  const lines: string[] | undefined =
    p.regularOpeningHours?.weekdayDescriptions;
  return {
    id: p.id,
    name,
    latitude: lat,
    longitude: lon,
    rating: typeof p.rating === "number" ? p.rating : undefined,
    address: p.shortFormattedAddress ?? p.formattedAddress ?? undefined,
    businessStatus: p.businessStatus,
    openNow:
      typeof p.currentOpeningHours?.openNow === "boolean"
        ? p.currentOpeningHours.openNow
        : null,
    openingHours: lines?.length ? lines.join("\n") : undefined,
    phone: p.nationalPhoneNumber ?? undefined,
    photoNames: (p.photos ?? []).map((ph: any) => ph.name).filter(Boolean),
  };
}

const NEARBY_FIELDS = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.shortFormattedAddress",
  "places.businessStatus",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.currentOpeningHours.openNow",
].join(",");

/**
 * Mjesta zadanih Googleovih tipova oko točke, najbliža prva (najviše 20 —
 * toliko API vraća po upitu). Jedan upit za sve tipove jedne naše kategorije.
 */
export async function nearbySearchNew(opts: {
  key: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  includedTypes: string[];
  timeoutMs?: number;
}): Promise<{ places: NewPlace[]; error?: string }> {
  const { data, error } = await post(
    "/places:searchNearby",
    opts.key,
    NEARBY_FIELDS,
    {
      includedTypes: opts.includedTypes,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      languageCode: "hr",
      locationRestriction: {
        circle: {
          center: { latitude: opts.latitude, longitude: opts.longitude },
          radius: Math.min(opts.radiusM, 50000),
        },
      },
    },
    opts.timeoutMs ?? 8000,
  );
  if (error) {
    glog(`nearby ${opts.includedTypes.join("+")} failed:`, error);
    return { places: [], error };
  }
  const places = (data?.places ?? [])
    .map(toNewPlace)
    .filter((p: NewPlace | null): p is NewPlace => p !== null);
  return { places };
}

const DETAIL_FIELDS = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.rating",
  "places.nationalPhoneNumber",
  "places.photos.name",
  "places.regularOpeningHours.weekdayDescriptions",
  "places.currentOpeningHours.openNow",
].join(",");

/**
 * Pronalazi mjesto po nazivu u blizini točke i vraća njegove pojedinosti —
 * radno vrijeme, ocjenu, telefon, fotografije. Jedan upit umjesto dva (prije:
 * "find place" pa "details").
 */
export async function findPlaceNew(opts: {
  key: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM?: number;
  timeoutMs?: number;
}): Promise<{ place: NewPlace | null; error?: string }> {
  const { data, error } = await post(
    "/places:searchText",
    opts.key,
    DETAIL_FIELDS,
    {
      textQuery: opts.name,
      maxResultCount: 1,
      languageCode: "hr",
      locationBias: {
        circle: {
          center: { latitude: opts.latitude, longitude: opts.longitude },
          radius: opts.radiusM ?? 500,
        },
      },
    },
    opts.timeoutMs ?? 7000,
  );
  if (error) {
    glog("find place failed:", error);
    return { place: null, error };
  }
  return { place: toNewPlace(data?.places?.[0]) };
}

/** URL fotografije za <Image>. Ključ je u URL-u, kao i prije kod starog API-ja. */
export function placePhotoUrl(photoName: string, key: string, maxWidth = 800) {
  return `${BASE}/${photoName}/media?maxWidthPx=${maxWidth}&key=${key}`;
}
