// app/complete-profile.tsx
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { API_ENDPOINTS } from "./config/api";
import { T } from "../styles/varaTheme";
import { getToken } from "@/utils/tokenStore";

export default function CompleteProfileScreen() {
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!birthDate) {
      Alert.alert("Greška", "Odaberi datum rođenja.");
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(API_ENDPOINTS.COMPLETE_PROFILE, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          birthDate: birthDate.toISOString().split("T")[0],
        }),
      });
      if (res.ok) {
        router.replace("/(tabs)");
      } else {
        Alert.alert("Greška", "Spremanje nije uspjelo.");
      }
    } catch {
      Alert.alert("Greška", "Provjeri internetsku vezu.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.root}>
      <Text style={s.title}>Još samo jedna stvar</Text>
      <Text style={s.subtitle}>Unesi svoj datum rođenja da dovršiš profil</Text>

      <TouchableOpacity style={s.dateBtn} onPress={() => setShowPicker(true)}>
        <Text style={s.dateBtnText}>
          {birthDate ? birthDate.toISOString().split("T")[0] : "Odaberi datum"}
        </Text>
      </TouchableOpacity>

      {showPicker && (
        <DateTimePicker
          value={birthDate || new Date(2000, 0, 1)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          maximumDate={new Date()}
          onChange={(event, selectedDate) => {
            setShowPicker(false);
            if (selectedDate) setBirthDate(selectedDate);
          }}
        />
      )}

      <TouchableOpacity
        style={[s.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.saveBtnText}>Spremi i nastavi</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#1B3F0E",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: T.screen,
    fontWeight: "800",
    color: "#fff",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: T.body,
    color: "rgba(255,255,255,0.7)",
    marginBottom: 32,
    textAlign: "center",
  },
  dateBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 24,
  },
  dateBtnText: { fontSize: T.lead, color: "#142F09", fontWeight: "600" },
  saveBtn: {
    backgroundColor: "#2D6418",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontSize: T.lead, fontWeight: "700" },
});
