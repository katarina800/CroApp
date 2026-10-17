import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_ENDPOINTS } from "./config/api";
import { T } from "../styles/varaTheme";
import { KeyboardSafeScrollView } from "../components/KeyboardSafeScrollView";
import { getToken } from "@/utils/tokenStore";
import { A } from "../styles/authTheme";
import { Ionicons } from "@expo/vector-icons";

type PasswordStrength = "empty" | "weak" | "medium" | "strong";

function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  if (password.length < 6) return "weak";

  let score = 0;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return "weak";
  if (score <= 2) return "medium";
  return "strong";
}

function generateStrongPassword(length = 14): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*_-+=";
  const all = lower + upper + digits + symbols;

  let pwd =
    lower[Math.floor(Math.random() * lower.length)] +
    upper[Math.floor(Math.random() * upper.length)] +
    digits[Math.floor(Math.random() * digits.length)] +
    symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = pwd.length; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  return pwd
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

const STRENGTH_COLORS: Record<
  PasswordStrength,
  { color: string; barWidth: `${number}%` }
> = {
  empty: { color: A.divider, barWidth: "0%" },
  weak: { color: A.error, barWidth: "33%" },
  medium: { color: A.warn, barWidth: "66%" },
  strong: { color: A.valid, barWidth: "100%" },
};

const STORAGE_GENERATED_PASSWORD = "vara_generated_password_v1";

export default function SetPasswordScreen() {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleGenerateStrongPassword = async () => {
    const generated = generateStrongPassword();
    setPassword(generated);
    setConfirmPassword(generated);

    try {
      await AsyncStorage.setItem(STORAGE_GENERATED_PASSWORD, generated);
    } catch {
      // tiho ignoriraj — spremanje lokalne kopije nije kritično za tok registracije
    }

    Alert.alert(
      t("password.suggestedTitle"),
      `${generated}\n\n${t("password.suggestedBody")}`,
    );
  };

  const handleSave = async () => {
    if (password.length < 6) {
      Alert.alert(t("common.error"), t("auth.passwordTooShort"));
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert(t("common.error"), t("auth.passwordsDoNotMatch"));
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(API_ENDPOINTS.SET_PASSWORD, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        await AsyncStorage.removeItem(STORAGE_GENERATED_PASSWORD);

        const needsBirthDate = await AsyncStorage.getItem("needsBirthDate");
        if (needsBirthDate === "true") {
          router.replace("/complete-profile");
        } else {
          router.replace("/(tabs)");
        }
      } else {
        Alert.alert(t("common.error"), t("auth.passwordSaveFailed"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.checkConnection"));
    } finally {
      setSaving(false);
    }
  };

  const strength = getPasswordStrength(password);

  return (
    <KeyboardSafeScrollView
      style={{ backgroundColor: A.bg }}
      contentContainerStyle={s.root}
    >
      <Text style={s.title}>Postavi lozinku</Text>
      <Text style={s.subtitle}>
        Trebat će ti za prijavu putem korisničkog imena, bez obzira registrirala
        si se putem Googlea.
      </Text>

      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          selectTextOnFocus
          style={s.input}
          placeholder="Nova lozinka"
          placeholderTextColor={A.placeholder}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <TouchableOpacity
          style={{
            position: "absolute",
            right: 14,
            height: "100%",
            justifyContent: "center",
            zIndex: 10,
            elevation: 10,
          }}
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={showPassword ? "eye" : "eye-off"}
            size={22}
            color={showPassword ? A.accent : A.textDim}
          />
        </TouchableOpacity>
      </View>

      {/* Uvjet lozinke + indikator jačine + generator */}
      <View style={{ marginTop: -6, marginBottom: 14 }}>
        <Text
          style={{
            fontSize: T.meta,
            color:
              password.length === 0
                ? A.textDim
                : password.length < 6
                  ? A.error // crveno
                  : A.valid, // zeleno
            marginBottom: 6,
          }}
        >
          {t("password.minLength")}
        </Text>

        {password.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: A.divider,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: STRENGTH_COLORS[strength].barWidth,
                  backgroundColor: STRENGTH_COLORS[strength].color,
                }}
              />
            </View>
            <Text
              style={{
                fontSize: T.meta,
                fontWeight: "700",
                marginTop: 4,
                color: STRENGTH_COLORS[strength].color,
              }}
            >
              {t(`password.strength.${strength}`)}
            </Text>
          </View>
        )}

        <TouchableOpacity
          onPress={handleGenerateStrongPassword}
          disabled={saving}
          style={{ alignSelf: "flex-start" }}
        >
          <Text
            style={{
              fontSize: T.meta,
              fontWeight: "700",
              color: A.valid,
              textDecorationLine: "underline",
            }}
          >
            {t("password.suggestStrong")}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ position: "relative", justifyContent: "center" }}>
        <TextInput
          selectTextOnFocus
          style={s.input}
          placeholder="Potvrdi lozinku"
          placeholderTextColor={A.placeholder}
          secureTextEntry={!showConfirmPassword}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
        <TouchableOpacity
          style={{
            position: "absolute",
            right: 14,
            height: "100%",
            justifyContent: "center",
            zIndex: 10,
            elevation: 10,
          }}
          onPress={() => setShowConfirmPassword((v) => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name={showConfirmPassword ? "eye" : "eye-off"}
            size={22}
            color={showConfirmPassword ? A.accent : A.textDim}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[s.saveBtn, saving && { opacity: 0.6 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color={A.onPrimary} />
        ) : (
          <Text style={s.saveBtnText}>Spremi i nastavi</Text>
        )}
      </TouchableOpacity>
    </KeyboardSafeScrollView>
  );
}

const s = StyleSheet.create({
  root: {
    flexGrow: 1,
    backgroundColor: A.bg,
    padding: 24,
    justifyContent: "center",
  },
  title: {
    fontSize: T.screen,
    fontWeight: "800",
    color: A.text,
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: T.body,
    color: A.textDim,
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 20,
  },
  input: {
    backgroundColor: A.inputBg,
    borderWidth: 1.5,
    borderColor: A.inputBorder,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: T.lead,
    marginBottom: 14,
    color: A.text,
  },
  saveBtn: {
    backgroundColor: A.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: A.onPrimary, fontSize: T.lead, fontWeight: "700" },
});
