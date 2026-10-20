// styles/authTheme.ts
//
// Boje ekrana prijave, registracije, oporavka lozinke i potvrde e-maila.
//
// Prije su ti ekrani bili bijela kartica na zelenoj pozadini, a ostatak
// aplikacije (karta, ploča, profil) je tamnozelen — korisnik bi iz svijetlog
// ulaza upao u potpuno drugi svijet. Sada je kartica iz iste obitelji kao i
// ostatak ("Vara" tema), sa zlatnim naglaskom za fokus i poveznice.
//
// Omjeri kontrasta (WCAG, traži se ≥ 4.5 za običan tekst):
//   text na kartici 10.3 · textDim na kartici 5.7 · accent na kartici 6.9
//   onPrimary na primary 5.2 · error na kartici 5.4 · placeholder na polju ≥ 4.5

export const A = {
  /** Pozadina ekrana. */
  bg: "#1A2E15",
  /** Traka stanja na vrhu. */
  statusBar: "#0D2406",
  /** Kartica s formom. */
  card: "#243B1E",
  cardBorder: "#4A7040",

  /** Polje za unos (utisnuto: tamnije od kartice). */
  inputBg: "#16270F",
  inputBgFocus: "#1A2E15",
  inputBorder: "#4A7040",
  /** Rub aktivnog polja i poveznice. */
  focus: "#D8C27A",
  /** Razdjelnici, prazan dio mjerača snage. */
  divider: "#3A5A30",

  text: "#E8EDE4",
  textDim: "#A9B4A4",
  placeholder: "#939F8E",

  /** Glavni gumb: svijetla zelena s tamnim tekstom. */
  primary: "#6E9E5C",
  onPrimary: "#12250E",
  primaryDisabled: "#46543F",
  onDisabled: "#C4CABC",

  /** Poveznice i obrubljeni gumbi. */
  accent: "#D8C27A",
  valid: "#6FCF73",
  error: "#FF8A80",
  warn: "#F2B84B",
} as const;
