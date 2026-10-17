// Svi jezici moraju imati iste ključeve i iste {{varijable}} kao hrvatski.
// Prevoditi se smije tekst, ne ono što kod ubacuje u njega.

import deLocale from "../app/locales/de.json";
import enLocale from "../app/locales/en.json";
import frLocale from "../app/locales/fr.json";
import hrLocale from "../app/locales/hr.json";
import itLocale from "../app/locales/it.json";

const LOCALES: Record<string, unknown> = {
  en: enLocale,
  it: itLocale,
  de: deLocale,
  fr: frLocale,
};

function flatten(obj: unknown, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") Object.assign(out, flatten(v, key));
      else out[key] = String(v);
    }
  }
  return out;
}

const vars = (s: string) =>
  (s.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((x) => x.replace(/\s/g, "")).sort();

const base = flatten(hrLocale);

describe.each(Object.keys(LOCALES))("prijevod %s", (lang) => {
  const target = flatten(LOCALES[lang]);

  it("ima sve ključeve hrvatskog", () => {
    const missing = Object.keys(base).filter((k) => !(k in target));
    expect(missing).toEqual([]);
  });

  it("nema ključeva kojih hrvatski nema", () => {
    const extra = Object.keys(target).filter((k) => !(k in base));
    expect(extra).toEqual([]);
  });

  it("koristi iste {{varijable}} kao hrvatski", () => {
    const mismatched = Object.keys(base).filter(
      (k) =>
        k in target &&
        JSON.stringify(vars(base[k])) !== JSON.stringify(vars(target[k])),
    );
    expect(mismatched).toEqual([]);
  });

  it("nema praznih prijevoda tamo gdje hrvatski nije prazan", () => {
    const empty = Object.entries(target)
      .filter(([k, v]) => v.trim() === "" && (base[k] ?? "").trim() !== "")
      .map(([k]) => k);
    expect(empty).toEqual([]);
  });
});
