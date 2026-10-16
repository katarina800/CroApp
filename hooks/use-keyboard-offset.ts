import { RefObject, useEffect, useState } from "react";
import { Dimensions, Keyboard, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Stvarna visina tipkovnice, u pikselima (0 kad je zatvorena).
 *
 * Zašto se mjeri ručno umjesto da se koristi `KeyboardAvoidingView`:
 * unutar `<Modal>`-a na Androidu tipkovnica NE pomiče sadržaj — modal je
 * zaseban prozor koji ne nasljeđuje "adjustResize" postavku aplikacije, pa se
 * `KeyboardAvoidingView` (koji se na Androidu oslanja upravo na to) nema na što
 * osloniti i polje za unos ostane skriveno ispod tipkovnice.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) =>
      setHeight(e.endCoordinates?.height ?? 0),
    );
    const hideSub = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}

/**
 * Razmak koji redak s unosom mora ostaviti pri dnu ekrana.
 *
 * Aplikacija radi u "edge-to-edge" načinu (app.json), dakle crta ispod
 * sistemskih traka. U tom načinu visina koju tipkovnica prijavi ne pokriva i
 * pojas trake za navigaciju gestama, pa je odmak samo za visinu tipkovnice
 * taman premali — polje ostaje vidljivo tek rubom. Zato se sigurnosni razmak
 * (insets.bottom) dodaje i kad je tipkovnica otvorena, plus mali vizualni
 * odmak da polje ne bude zalijepljeno uz tipkovnicu.
 */
export function useInputBottomOffset(): number {
  const keyboardHeight = useKeyboardHeight();
  const insets = useSafeAreaInsets();

  return keyboardHeight > 0
    ? keyboardHeight + insets.bottom + 8
    : insets.bottom;
}

/**
 * Koliko tipkovnica STVARNO prekriva dno zadanog prikaza (0 kad ga ne prekriva).
 *
 * Zašto mjerenje, a ne pretpostavka: na Androidu s uključenim "edge-to-edge"
 * načinom (app.json) ponašanje ovisi o inačici sustava i proizvođaču. Negdje
 * sustav sam smanji prozor kad se pojavi tipkovnica, negdje ne — a tada
 * tipkovnica prekrije polje za unos i korisnik ne vidi što tipka. Ako se oslonimo
 * na sustav, na jednima ne radi; ako dodamo vlastiti odmak "za svaki slučaj", na
 * drugima se prilagodba dvaput zbroji i ekran titra (zato je ovdje prije bio
 * maknut KeyboardAvoidingView).
 *
 * Ovdje se usporedi gdje prikaz završava i gdje tipkovnica počinje, pa se doda
 * točno onoliko koliko prekriva. Ako je sustav već smanjio prozor, preklapanja
 * nema i ne dodaje se ništa.
 *
 * Prikaz koji se mjeri mora biti onaj čiji se donji rub treba podići; odmak se
 * primjenjuje kao paddingBottom NA NJEMU (padding ne mijenja njegov donji rub,
 * pa se mjerenje ne pomiče samo od sebe). iOS vrati 0: tamo radi
 * KeyboardAvoidingView s behavior="padding".
 */
export function useKeyboardOverlap(ref: RefObject<View | null>): number {
  const [overlap, setOverlap] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      const height = e.endCoordinates?.height ?? 0;
      const keyboardTop =
        e.endCoordinates?.screenY ?? Dimensions.get("window").height - height;
      // Kratko čekanje: ako sustav ipak mijenja veličinu prozora, neka završi
      // prije mjerenja da ne zbrojimo dvije prilagodbe.
      setTimeout(() => {
        ref.current?.measureInWindow((_x, y, _w, h) => {
          const gap = y + h - keyboardTop;
          setOverlap(gap > 0 ? Math.ceil(gap) + 8 : 0);
        });
      }, 60);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () =>
      setOverlap(0),
    );

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [ref]);

  return overlap;
}
