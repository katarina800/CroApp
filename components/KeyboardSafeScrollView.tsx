// components/KeyboardSafeScrollView.tsx
//
// ScrollView za ekrane s poljima za unos (prijava, registracija, oporavak
// lozinke, potvrda e-maila ...), koji ne dopušta da tipkovnica prekrije polje u
// koje korisnik tipka.
//
// Dvije stvari, jer obje fale kad se ekran oslanja na sustav:
//  1. Donji razmak: izmjeri se koliko tipkovnica STVARNO prekriva dno prikaza
//     (useKeyboardOverlap) i doda kao paddingBottom, pa se sadržaj može
//     povući iznad tipkovnice. Na iOS-u to radi KeyboardAvoidingView.
//  2. Pomicanje do polja: dok je tipkovnica otvorena, ovdje se svako toliko
//     provjerava je li fokusirano polje ispod njezina ruba i, ako jest, lista
//     se pomakne točno toliko da se polje vidi — i kad korisnik prijeđe na
//     iduće polje (tada tipkovnica ne šalje novi događaj).
//
// Zamjena za <ScrollView>: isti propovi, plus ref na pravi ScrollView.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  ScrollViewProps,
  TextInput,
  View,
} from "react-native";

import { useKeyboardOverlap } from "../hooks/use-keyboard-offset";

/** Koliko mjesta ostaje između dna polja i vrha tipkovnice. */
const FIELD_MARGIN = 28;
const POLL_MS = 250;

export const KeyboardSafeScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardSafeScrollView(props, ref) {
    const { children, onScroll, keyboardShouldPersistTaps, ...rest } = props;

    const areaRef = useRef<View>(null);
    const scrollRef = useRef<ScrollView>(null);
    const offsetY = useRef(0);
    const keyboardTop = useRef<number | null>(null);
    const overlap = useKeyboardOverlap(areaRef);

    useImperativeHandle(ref, () => scrollRef.current as ScrollView);

    useEffect(() => {
      let timer: ReturnType<typeof setInterval> | null = null;

      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
        keyboardTop.current = null;
      };

      const check = () => {
        const top = keyboardTop.current;
        if (top == null) return;
        const focused = TextInput.State.currentlyFocusedInput?.();
        if (!focused) return;
        focused.measureInWindow((_x, y, _w, h) => {
          const hidden = y + h + FIELD_MARGIN - top;
          if (hidden > 1) {
            scrollRef.current?.scrollTo({
              y: offsetY.current + hidden,
              animated: true,
            });
          }
        });
      };

      const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
        keyboardTop.current =
          e.endCoordinates?.screenY ?? (e.endCoordinates ? 0 : null);
        // Prvo mjerenje čeka da se doda donji razmak (useKeyboardOverlap).
        setTimeout(check, 120);
        if (!timer) timer = setInterval(check, POLL_MS);
      });
      const hideSub = Keyboard.addListener("keyboardDidHide", stop);

      return () => {
        showSub.remove();
        hideSub.remove();
        stop();
      };
    }, []);

    return (
      <View
        ref={areaRef}
        collapsable={false}
        style={{
          flex: 1,
          paddingBottom: Platform.OS === "android" ? overlap : 0,
        }}
      >
        <ScrollView
          {...rest}
          ref={scrollRef}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
          scrollEventThrottle={16}
          onScroll={(e) => {
            offsetY.current = e.nativeEvent.contentOffset.y;
            onScroll?.(e);
          }}
        >
          {children}
        </ScrollView>
      </View>
    );
  },
);
