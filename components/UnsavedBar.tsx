// components/UnsavedBar.tsx
//
// Traka "Imaš nespremljene promjene" koja se pojavi pri dnu ekrana čim korisnik
// nešto promijeni, i nestane kad je spremljeno.
//
// Zašto: gumb "Spremi" je na više ekrana na samom dnu liste ili u kutu zaglavlja
// pa se lako previdi — korisnik promijeni postavku, zatvori prozor i misli da je
// gotovo. Traka je uvijek na istom mjestu (uz donji rub), zlatno obrubljena, a
// gumb u njoj lagano pulsira dok promjene nisu spremljene.
//
// Roditelj mora biti pozicioniran (flex:1 prozor); traka je position:absolute.

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Animated,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const GOLD = "#C9A227";

export function UnsavedBar({
  visible,
  onPress,
  loading = false,
  label,
  hint,
}: {
  /** Ima li nespremljenih promjena. */
  visible: boolean;
  onPress: () => void;
  loading?: boolean;
  /** Natpis na gumbu (zadano: "Spremi"). */
  label?: string;
  /** Tekst lijevo od gumba (zadano: "Imaš nespremljene promjene"). */
  hint?: string;
}) {
  const { t } = useTranslation();
  const slide = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: visible ? 1 : 0,
      friction: 8,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  useEffect(() => {
    if (!visible || loading) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [visible, loading, pulse]);

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[
        styles.bar,
        {
          opacity: slide,
          transform: [
            {
              translateY: slide.interpolate({
                inputRange: [0, 1],
                outputRange: [90, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.dot} />
      <Text style={styles.hint} numberOfLines={2}>
        {hint ?? t("common.unsavedChanges")}
      </Text>
      <Animated.View
        style={{
          transform: [
            {
              scale: pulse.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.06],
              }),
            },
          ],
        }}
      >
        <TouchableOpacity
          style={styles.btn}
          onPress={onPress}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={label ?? t("common.save")}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#1A2E15" />
          ) : (
            <Text style={styles.btnText}>{label ?? t("common.save")}</Text>
          )}
        </TouchableOpacity>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: Platform.OS === "ios" ? 24 : 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: 16,
    backgroundColor: "rgba(26,46,21,0.97)",
    borderWidth: 1.5,
    borderColor: GOLD,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 14,
    zIndex: 50,
  },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GOLD },
  hint: { flex: 1, color: "#F7F0DC", fontSize: 14, fontWeight: "600" },
  btn: {
    minWidth: 96,
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: GOLD,
  },
  btnText: { color: "#1A2E15", fontSize: 15, fontWeight: "800" },
});
