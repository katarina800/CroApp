# Ikone aplikacije

Nove ikone kategorija, doba dana, društva i prijevoza (chiselled-badge set, 32 komada).

- `*.png` — 384×384 prozirni PNG-ovi koje aplikacija prikazuje (PNG, a ne SVG, jer se ikone crtaju i unutar
  `<Marker>` na karti, gdje SVG nije pouzdan).
- `src/*.svg` — izvori. Za promjenu ikone uredi SVG pa ga ponovno izvezi u PNG iste veličine (384×384, prozirna
  pozadina) pod istim imenom.
- Ključevi i povezivanje s kodom: `constants/icons.ts`.

## Stare ikone

Stare viking kovanice **nisu obrisane**: i dalje su u `assets/images/` (`jutro.png`, `restoran.png`, `auto.png` …).
U `constants/icons.ts` nalaze se u `LEGACY_ICONS`. Povratak na njih: postavi `USE_LEGACY_ICONS = true`.
