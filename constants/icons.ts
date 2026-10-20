// constants/icons.ts
//
// Jedino mjesto na kojem se biraju ikone kategorija, doba dana, društva i prijevoza.
//
// NOVE ikone (chiselled-badge set) su PNG-ovi 384×384 u assets/images/icons/, a njihovi
// izvori su SVG-ovi u assets/images/icons/src/. PNG se koristi (a ne SVG) jer se ikone
// crtaju i unutar <Marker> na karti, gdje react-native-maps ne iscrtava pouzdano SVG.
//
// STARE ikone (viking kovanice) NISU obrisane: i dalje leže u assets/images/*.png, a
// ovdje su u LEGACY_ICONS. Povratak na njih je jedna promjena: USE_LEGACY_ICONS = true.
//
// Ključevi su isti kao id-evi koje aplikacija već koristi (CATEGORY_ICONS u dashboardu,
// CompanionType / TransportType u PlanMyDayModal, doba dana jutro/poslijepodne/vecer).

import type { ImageSourcePropType } from "react-native";

/** true = prikaži stare viking kovanice umjesto novih ikona. */
export const USE_LEGACY_ICONS = false;

export type IconKey =
  // doba dana
  | "jutro"
  | "poslijepodne"
  | "vecer"
  // kategorije
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
  | "spa"
  | "other"
  // društvo
  | "solo"
  | "partner"
  | "prijatelji"
  | "obitelj"
  | "mjesovit"
  // prijevoz
  | "auto"
  | "javni"
  | "pjesice"
  | "bicikl"
  | "kombinirano"
  // navigacija
  | "navMap"
  | "navVideo"
  | "navMessages"
  | "navSearch"
  | "navProfile"
  // alati i izbornik
  | "planDay"
  | "groups"
  | "archive"
  | "badges"
  | "notifications"
  | "radius"
  | "visited"
  // dobne skupine
  | "ageMinors"
  | "ageYouth"
  | "ageStudents"
  | "ageAdults"
  | "ageRetired"
  // oznaka korisnika na karti
  | "traveller"
  // stil putovanja
  | "styleRelaxed"
  | "styleCultural"
  | "styleAdventure"
  // kontrole karte (nova ikona, stare nema)
  | "mapLocate"
  | "mapActivities"
  // prijava i oporavak lozinke
  | "authMail"
  | "authKey"
  | "authLock";

export const NEW_ICONS: Record<IconKey, ImageSourcePropType> = {
  jutro: require("../assets/images/icons/time-morning.png"),
  poslijepodne: require("../assets/images/icons/time-afternoon.png"),
  vecer: require("../assets/images/icons/time-evening.png"),

  restaurant: require("../assets/images/icons/category-restaurant.png"),
  cafe: require("../assets/images/icons/category-cafe.png"),
  club: require("../assets/images/icons/category-club.png"),
  beach: require("../assets/images/icons/category-beach.png"),
  landmark: require("../assets/images/icons/category-landmark.png"),
  opg: require("../assets/images/icons/category-opg.png"),
  accommodation: require("../assets/images/icons/category-accommodation.png"),
  market: require("../assets/images/icons/category-market.png"),
  paintball: require("../assets/images/icons/category-paintball.png"),
  cinema: require("../assets/images/icons/category-cinema.png"),
  park: require("../assets/images/icons/category-park.png"),
  escapeRoom: require("../assets/images/icons/category-escape-room.png"),
  museum: require("../assets/images/icons/category-museum.png"),
  theater: require("../assets/images/icons/category-theater.png"),
  mountain: require("../assets/images/icons/category-mountain.png"),
  nationalPark: require("../assets/images/icons/category-national-park.png"),
  cave: require("../assets/images/icons/category-cave.png"),
  spa: require("../assets/images/icons/category-spa.png"),
  other: require("../assets/images/icons/category-other.png"),

  solo: require("../assets/images/icons/companion-solo.png"),
  partner: require("../assets/images/icons/companion-partner.png"),
  prijatelji: require("../assets/images/icons/companion-friends.png"),
  obitelj: require("../assets/images/icons/companion-family.png"),
  mjesovit: require("../assets/images/icons/companion-group.png"),

  auto: require("../assets/images/icons/transport-car.png"),
  javni: require("../assets/images/icons/transport-public.png"),
  pjesice: require("../assets/images/icons/transport-walk.png"),
  bicikl: require("../assets/images/icons/transport-bike.png"),
  kombinirano: require("../assets/images/icons/transport-combined.png"),

  // navigacija, alati, dobne skupine, korisnik na karti
  navMap: require("../assets/images/icons/nav-map.png"),
  navVideo: require("../assets/images/icons/nav-video.png"),
  navMessages: require("../assets/images/icons/nav-messages.png"),
  navSearch: require("../assets/images/icons/nav-search.png"),
  navProfile: require("../assets/images/icons/nav-profile.png"),
  planDay: require("../assets/images/icons/tool-plan.png"),
  groups: require("../assets/images/icons/tool-groups.png"),
  archive: require("../assets/images/icons/tool-archive.png"),
  badges: require("../assets/images/icons/tool-badges.png"),
  notifications: require("../assets/images/icons/tool-notifications.png"),
  radius: require("../assets/images/icons/tool-radius.png"),
  visited: require("../assets/images/icons/tool-visited.png"),
  ageMinors: require("../assets/images/icons/age-minors.png"),
  ageYouth: require("../assets/images/icons/age-youth.png"),
  ageStudents: require("../assets/images/icons/age-students.png"),
  ageAdults: require("../assets/images/icons/age-adults.png"),
  ageRetired: require("../assets/images/icons/age-retired.png"),
  traveller: require("../assets/images/icons/map-traveller.png"),
  styleRelaxed: require("../assets/images/icons/style-relaxed.png"),
  styleCultural: require("../assets/images/icons/style-cultural.png"),
  styleAdventure: require("../assets/images/icons/style-adventure.png"),
  mapLocate: require("../assets/images/icons/map-locate.png"),
  mapActivities: require("../assets/images/icons/map-activities.png"),
  authMail: require("../assets/images/icons/auth-mail.png"),
  authKey: require("../assets/images/icons/auth-key.png"),
  authLock: require("../assets/images/icons/auth-lock.png"),
};

/**
 * Stare ikone, nepromijenjene. Stil putovanja i kontrole karte (locate/activities) nikad nisu
 * imali ikonu, pa ih ovdje nema. "Ostalo" nikad nije imalo ikonu (ekran je crtao emoji u
 * kovanici), pa ga ovdje nema — u starom načinu ostaje isto kao prije.
 */
export const LEGACY_ICONS: Partial<Record<IconKey, ImageSourcePropType>> = {
  jutro: require("../assets/images/jutro.png"),
  poslijepodne: require("../assets/images/popodne.png"),
  vecer: require("../assets/images/vecer.png"),

  restaurant: require("../assets/images/restoran.png"),
  cafe: require("../assets/images/kafic.png"),
  club: require("../assets/images/disco.png"),
  beach: require("../assets/images/plaza.png"),
  landmark: require("../assets/images/znamenitost.png"),
  opg: require("../assets/images/opg.png"),
  accommodation: require("../assets/images/smjestaj.png"),
  market: require("../assets/images/trznica.png"),
  paintball: require("../assets/images/paintball.png"),
  cinema: require("../assets/images/kino.png"),
  park: require("../assets/images/park.png"),
  escapeRoom: require("../assets/images/escape.png"),
  museum: require("../assets/images/muzej.png"),
  theater: require("../assets/images/kazaliste.png"),
  mountain: require("../assets/images/planina.png"),
  nationalPark: require("../assets/images/nacpark.png"),
  cave: require("../assets/images/spilja.png"),
  spa: require("../assets/images/toplica.png"),

  solo: require("../assets/images/sam.png"),
  partner: require("../assets/images/partner.png"),
  prijatelji: require("../assets/images/prijatelj.png"),
  obitelj: require("../assets/images/obitelj.png"),
  mjesovit: require("../assets/images/mjesovit.png"),

  auto: require("../assets/images/auto.png"),
  javni: require("../assets/images/javni.png"),
  pjesice: require("../assets/images/pjesice.png"),
  bicikl: require("../assets/images/bicikl.png"),
  kombinirano: require("../assets/images/kombinirano.png"),

  navMap: require("../assets/images/karta.png"),
  navVideo: require("../assets/images/video.png"),
  navMessages: require("../assets/images/poruka.png"),
  navSearch: require("../assets/images/pretraga.png"),
  navProfile: require("../assets/images/profil.png"),
  planDay: require("../assets/images/put.png"),
  groups: require("../assets/images/grupe.png"),
  archive: require("../assets/images/arhiva.png"),
  badges: require("../assets/images/uspjeh.png"),
  notifications: require("../assets/images/obav.png"),
  radius: require("../assets/images/radijus.png"),
  visited: require("../assets/images/posmjesta.png"),
  ageMinors: require("../assets/images/maloletnik.png"),
  ageYouth: require("../assets/images/mladi.png"),
  ageStudents: require("../assets/images/student.png"),
  ageAdults: require("../assets/images/odrasli.png"),
  ageRetired: require("../assets/images/umirovljenik.png"),
  traveller: require("../assets/images/putnik.png"),
};

/**
 * Ikone koje aplikacija trenutno prikazuje (prema USE_LEGACY_ICONS).
 *
 * Tip tvrdi da postoje sve; jedina iznimka je "other" u starom načinu (nikad nije imao ikonu), pa je
 * tamo undefined — pozivatelji koji crtaju "other" već imaju rezervni emoji (`icon ? <Image/> : <Text/>`).
 */
export const APP_ICONS = (
  USE_LEGACY_ICONS ? LEGACY_ICONS : NEW_ICONS
) as Record<IconKey, ImageSourcePropType>;

/** Ikona po ključu, ili undefined (tada pozivatelj crta svoj rezervni emoji). */
export function getIcon(key: string): ImageSourcePropType | undefined {
  return (APP_ICONS as Record<string, ImageSourcePropType | undefined>)[key];
}
