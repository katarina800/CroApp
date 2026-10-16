// app/register.tsx — VARA redesign v2 (puna zelena pozadina)
import { router } from "expo-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import LanguageSelector from "../components/LanguageSelector";
import { useGoogleAuth } from "../hooks/useGoogleAuth";

import DateTimePicker from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { API_ENDPOINTS } from "./config/api";
import * as Linking from "expo-linking";
import { API_BASE_URL } from "./config/api";
import { T } from "../styles/varaTheme";

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
  empty: { color: "#D1DADB", barWidth: "0%" },
  weak: { color: "#C0392B", barWidth: "33%" },
  medium: { color: "#E29A1E", barWidth: "66%" },
  strong: { color: "#4CAF50", barWidth: "100%" },
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface RegisterData {
  firstName: string;
  lastName: string;
  username: string;
  password: string;
  birthDate: string;
  email?: string | null;
  language: string;
}

export default function RegisterScreen() {
  const { t, i18n } = useTranslation();
  const { width } = useWindowDimensions();
  const isCompact = width < 360;

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    username: "",
    password: "",
    birthDate: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const { promptAsync, isLoading: isGoogleLoading } = useGoogleAuth();
  const isBusy = isLoading || isGoogleLoading;

  const handleChange = (name: string, value: string) =>
    setForm({ ...form, [name]: value });

  const validateForm = () => {
    if (!form.firstName.trim()) {
      Alert.alert(t("common.error"), t("validation.enterFirstName"));
      return false;
    }
    if (!form.lastName.trim()) {
      Alert.alert(t("common.error"), t("validation.enterLastName"));
      return false;
    }
    if (!form.email.trim()) {
      Alert.alert(t("common.error"), t("validation.enterEmail"));
      return false;
    }
    if (!EMAIL_REGEX.test(form.email.trim())) {
      Alert.alert(t("common.error"), t("validation.invalidEmail"));
      return false;
    }
    if (!form.username.trim()) {
      Alert.alert(t("common.error"), t("validation.enterUsername"));
      return false;
    }
    if (form.username.trim().length < 3) {
      Alert.alert(t("common.error"), t("validation.usernameMinLength"));
      return false;
    }
    if (!USERNAME_REGEX.test(form.username)) {
      Alert.alert(t("common.error"), t("validation.usernameChars"));
      return false;
    }
    if (!form.password.trim()) {
      Alert.alert(t("common.error"), t("validation.enterPassword"));
      return false;
    }
    if (form.password.length < 6) {
      Alert.alert(t("common.error"), t("validation.passwordMin"));
      return false;
    }
    if (!form.birthDate.trim()) {
      Alert.alert(t("common.error"), t("validation.enterBirthDate"));
      return false;
    }

    if (!DATE_REGEX.test(form.birthDate.trim())) {
      Alert.alert(t("common.error"), t("validation.invalidDateFormat"));
      return false;
    }

    const [year, month, day] = form.birthDate.trim().split("-").map(Number);
    const parsedDate = new Date(year, month - 1, day);
    const isValidDate =
      parsedDate.getFullYear() === year &&
      parsedDate.getMonth() === month - 1 &&
      parsedDate.getDate() === day;

    if (!isValidDate) {
      Alert.alert(t("common.error"), t("validation.invalidDate"));
      return false;
    }

    const today = new Date();
    if (parsedDate > today) {
      Alert.alert(t("common.error"), t("validation.futureDate"));
      return false;
    }

    const age =
      today.getFullYear() -
      year -
      (today < new Date(today.getFullYear(), month - 1, day) ? 1 : 0);

    if (age < 13) {
      Alert.alert(t("common.error"), t("validation.tooYoung"));
      return false;
    }
    if (age > 120) {
      Alert.alert(t("common.error"), t("validation.unrealisticAge"));
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    setIsLoading(true);
    try {
      const dataToSend: RegisterData = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        password: form.password,
        birthDate: form.birthDate,
        username: form.username.trim(),
        email: form.email.trim() || null,
        language: i18n.language,
      };
      const response = await fetch(API_ENDPOINTS.REGISTER, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dataToSend),
      });
      if (response.ok) {
        // Račun postoji, ali se otvara tek kad se potvrdi kod poslan na e-mail.
        // Adresa iz odgovora je ona koju je poslužitelj spremio (obrezana).
        const created = await response.json().catch(() => null);
        router.replace({
          pathname: "/verify-email",
          params: { email: created?.email ?? dataToSend.email ?? "" },
        });
      } else if (response.status === 429) {
        Alert.alert(t("common.error"), t("common.tooManyRequests"));
      } else {
        const errorData = await response.json().catch(() => null);
        if (errorData?.field === "username" && errorData?.code === "taken") {
          Alert.alert(t("common.error"), t("validation.usernameTaken"));
        } else if (
          errorData?.field === "email" &&
          errorData?.code === "taken"
        ) {
          Alert.alert(t("common.error"), t("validation.emailTaken"));
        } else if (
          errorData?.field === "email" &&
          errorData?.code === "invalid"
        ) {
          // Poslužitelj sada provjerava i format adrese, ne samo je li prazna.
          Alert.alert(t("common.error"), t("validation.invalidEmail"));
        } else if (
          errorData?.field === "username" &&
          errorData?.code === "invalid"
        ) {
          Alert.alert(t("common.error"), t("validation.usernameChars"));
        } else if (response.status === 409) {
          Alert.alert(t("common.error"), t("validation.duplicateGeneric"));
        } else {
          Alert.alert(t("common.error"), t("validation.registerFailed"));
        }
      }
    } catch {
      Alert.alert(t("common.error"), t("common.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const isBirthDateValid =
    DATE_REGEX.test(form.birthDate.trim()) &&
    (() => {
      const [y, m, d] = form.birthDate.trim().split("-").map(Number);
      const parsed = new Date(y, m - 1, d);
      return (
        parsed.getFullYear() === y &&
        parsed.getMonth() === m - 1 &&
        parsed.getDate() === d &&
        parsed <= new Date()
      );
    })();

  return (
    <KeyboardAvoidingView
      style={s.root}
      // FIX: na Androidu je ovdje stajao behavior="height". Aplikacija radi u
      // edge-to-edge načinu i sustav sam smanjuje prozor kad se otvori tipkovnica,
      // pa je KeyboardAvoidingView smanjivao visinu JOŠ JEDNOM. Dvije se prilagodbe
      // natežu oko visine ekrana kroz cijelu animaciju tipkovnice, što se vidi kao
      // neprekidno treperenje/vibriranje cijelog ekrana. Na Androidu zato nema
      // behaviora — sustav to odradi sam. (Unutar <Modal>-a KeyboardAvoidingView
      // ionako ne radi jer je modal zaseban prozor bez adjustResize; ondje se
      // koristi useInputBottomOffset iz hooks/use-keyboard-offset.)
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0D2406" />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header na zelenoj pozadini */}
        <View style={s.headerWrap}>
          <View style={s.header}>
            <Image
              source={require("../assets/images/vara_icon.png")}
              style={{
                width: isCompact ? 30 : 36,
                height: isCompact ? 30 : 36,
                borderRadius: 6,
              }}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }}>
              <Text style={s.appName}>VARA</Text>
              <Text style={s.headerSub}>{t("auth.register")}</Text>
            </View>
            <LanguageSelector />
          </View>
        </View>

        {/* Bijela kartica */}
        <View style={s.card}>
          {/* Ime i prezime */}
          <View style={s.row}>
            <View style={[s.fieldWrap, s.half]}>
              <Text style={s.label}>{t("auth.firstName").toUpperCase()} *</Text>
              <View style={{ justifyContent: "center" }}>
                <TextInput
                  selectTextOnFocus
                  style={[
                    s.input,
                    form.firstName.trim().length > 0 && s.inputValid,
                  ]}
                  placeholder="npr. Ana"
                  placeholderTextColor="#9AA9A7"
                  value={form.firstName}
                  onChangeText={(v) => handleChange("firstName", v)}
                  editable={!isBusy}
                />
                {form.firstName.trim().length > 0 && (
                  <Text style={s.validCheckmark}>✓</Text>
                )}
              </View>
              <Text style={s.helperText}>{t("auth.firstNameHelper")}</Text>
            </View>
            <View style={[s.fieldWrap, s.half]}>
              <Text style={s.label}>{t("auth.lastName").toUpperCase()} *</Text>
              <View style={{ justifyContent: "center" }}>
                <TextInput
                  selectTextOnFocus
                  style={[
                    s.input,
                    form.lastName.trim().length > 0 && s.inputValid,
                  ]}
                  placeholder="npr. Horvat"
                  placeholderTextColor="#9AA9A7"
                  value={form.lastName}
                  onChangeText={(v) => handleChange("lastName", v)}
                  editable={!isBusy}
                />
                {form.lastName.trim().length > 0 && (
                  <Text style={s.validCheckmark}>✓</Text>
                )}
              </View>
              <Text style={s.helperText}>{t("auth.lastNameHelper")}</Text>
            </View>
          </View>

          <Field
            label={`${t("auth.email").toUpperCase()} *`}
            placeholder="npr. ana.horvat@gmail.com"
            helperText={t("auth.emailHelperRegister")}
            value={form.email}
            onChangeText={(v) => handleChange("email", v)}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!isBusy}
            isValid={EMAIL_REGEX.test(form.email.trim())}
          />
          <Field
            label={`${t("auth.username").toUpperCase()} *`}
            placeholder="npr. ana_horvat"
            helperText={t("auth.usernameHelperRegister")}
            value={form.username}
            onChangeText={(v) => handleChange("username", v)}
            autoCapitalize="none"
            editable={!isBusy}
            isValid={
              form.username.trim().length >= 3 &&
              USERNAME_REGEX.test(form.username)
            }
          />
          <View style={s.fieldWrap}>
            <Text style={s.label}>{t("auth.password").toUpperCase()} *</Text>
            <View style={{ position: "relative", justifyContent: "center" }}>
              <TextInput
                selectTextOnFocus
                style={[s.input, form.password.length >= 6 && s.inputValid]}
                placeholder="Najmanje 6 znakova"
                placeholderTextColor="#9AA9A7"
                value={form.password}
                onChangeText={(v) => handleChange("password", v)}
                secureTextEntry={!showPassword}
                editable={!isBusy}
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
                <Text
                  style={{ fontSize: T.title, opacity: showPassword ? 1 : 0.5 }}
                >
                  👁️
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={{
                fontSize: T.meta,
                marginTop: 6,
                color:
                  form.password.length === 0
                    ? MUTED
                    : form.password.length < 6
                      ? "#C0392B"
                      : "#4CAF50",
              }}
            >
              {t("password.minLength")}
            </Text>

            {form.password.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <View
                  style={{
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: "#E8EEEE",
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      height: "100%",
                      width:
                        STRENGTH_COLORS[getPasswordStrength(form.password)]
                          .barWidth,
                      backgroundColor:
                        STRENGTH_COLORS[getPasswordStrength(form.password)]
                          .color,
                    }}
                  />
                </View>
                <Text
                  style={{
                    fontSize: T.meta,
                    fontWeight: "700",
                    marginTop: 4,
                    color:
                      STRENGTH_COLORS[getPasswordStrength(form.password)].color,
                  }}
                >
                  {t(`password.strength.${getPasswordStrength(form.password)}`)}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={() => {
                const generated = generateStrongPassword();
                setForm((prev) => ({ ...prev, password: generated }));
                Alert.alert(t("password.suggestedTitle"), generated);
              }}
              disabled={isBusy}
              style={{ marginTop: 8, alignSelf: "flex-start" }}
            >
              <Text
                style={{
                  fontSize: T.meta,
                  fontWeight: "700",
                  color: GREEN_MID,
                  textDecorationLine: "underline",
                }}
              >
                {t("password.suggestStrong")}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={s.fieldWrap}>
            <Text style={s.label}>{t("auth.birthDate").toUpperCase()} *</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1, justifyContent: "center" }}>
                <TextInput
                  selectTextOnFocus
                  style={[s.input, isBirthDateValid && s.inputValid]}
                  placeholder={t("auth.birthDatePlaceholder")}
                  placeholderTextColor="#9AA9A7"
                  value={form.birthDate}
                  onChangeText={(v) => handleChange("birthDate", v)}
                  editable={!isBusy}
                />
                {isBirthDateValid && <Text style={s.validCheckmark}>✓</Text>}
              </View>
              <TouchableOpacity
                style={{
                  width: 46,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: "#D1DADB",
                  backgroundColor: SILVER_LIGHT,
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => setShowPicker(true)}
              >
                <Text style={{ fontSize: T.title }}>📅</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.helperText}>{t("auth.birthDateHelper")}</Text>
          </View>
          {showPicker && (
            <DateTimePicker
              value={
                form.birthDate ? new Date(form.birthDate) : new Date(2000, 0, 1)
              }
              mode="date"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              maximumDate={new Date()}
              onChange={(event, selectedDate) => {
                setShowPicker(false);
                if (selectedDate) {
                  const iso = selectedDate.toISOString().split("T")[0];
                  handleChange("birthDate", iso);
                }
              }}
            />
          )}

          <TouchableOpacity
            style={[s.btn, isBusy && s.btnDisabled]}
            onPress={handleRegister}
            disabled={isBusy}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>{t("auth.registerBtn")}</Text>
            )}
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 20,
              marginBottom: 4,
            }}
          >
            <View style={{ flex: 1, height: 1, backgroundColor: "#D1DADB" }} />
            <Text
              style={{ marginHorizontal: 10, color: MUTED, fontSize: T.meta }}
            >
              {t("common.or").toUpperCase()}
            </Text>
            <View style={{ flex: 1, height: 1, backgroundColor: "#D1DADB" }} />
          </View>

          <TouchableOpacity
            style={s.googleBtn}
            onPress={() => promptAsync()}
            disabled={isBusy}
            activeOpacity={0.8}
          >
            {isGoogleLoading ? (
              <ActivityIndicator color={TEXT} />
            ) : (
              <Text style={s.googleBtnText}>
                {t("auth.continueWithGoogle")}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.linkWrap}
            onPress={() => router.push("/login")}
            disabled={isBusy}
          >
            <Text style={s.linkText}>
              {t("auth.hasAccount")}{" "}
              <Text style={s.linkBold}>{t("auth.loginBtn")}</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.bottomNote}>{t("auth.registerTerms")}</Text>
        {/* Oba ekrana su otprije pisala da korisnik prihvaća pravila
            privatnosti, a pravila nisu postojala niti su bila dostupna.
            Sada vode na stranicu koju poslužuje poslužitelj. */}
        <Text
          style={[s.bottomNote, { textDecorationLine: "underline" }]}
          onPress={() => Linking.openURL(`${API_BASE_URL}/privacy.html`)}
        >
          {t("auth.privacyLink")}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  placeholder: string;
  helperText?: string;
  value: string;
  onChangeText: (v: string) => void;
  isValid?: boolean;
  secureTextEntry?: boolean;
  keyboardType?: any;
  autoCapitalize?: any;
  editable?: boolean;
  optional?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const showValid = !!props.isValid && props.value.length > 0;
  return (
    <View style={s.fieldWrap}>
      <Text style={s.label}>
        {props.label}
        {props.optional && <Text style={s.optional}> (opcionalno)</Text>}
      </Text>
      <View style={{ justifyContent: "center" }}>
        <TextInput
          selectTextOnFocus
          style={[
            s.input,
            focused && s.inputFocused,
            showValid && s.inputValid,
          ]}
          placeholder={props.placeholder}
          placeholderTextColor="#9AA9A7"
          value={props.value}
          onChangeText={props.onChangeText}
          secureTextEntry={props.secureTextEntry}
          keyboardType={props.keyboardType}
          autoCapitalize={props.autoCapitalize}
          editable={props.editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {showValid && <Text style={s.validCheckmark}>✓</Text>}
      </View>
      {props.helperText && <Text style={s.helperText}>{props.helperText}</Text>}
    </View>
  );
}

const GREEN_DARK = "#1B3F0E";
const GREEN_MID = "#2D6418";
const SILVER_LIGHT = "#E8EEEE";
const TEXT = "#142F09";
const MUTED = "#5C6765";

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: GREEN_DARK },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 54 : 44,
    paddingBottom: 40,
    alignItems: "center",
  },
  headerWrap: {
    width: "100%",
    maxWidth: 480,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 24,
    paddingLeft: 4,
  },
  appName: {
    fontSize: T.screen,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 8,
    textShadowColor: "rgba(180,210,180,0.5)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  headerSub: {
    fontSize: T.meta,
    color: "rgba(200,225,200,0.55)",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    width: "100%",
    maxWidth: 480,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  fieldWrap: { marginBottom: 16 },
  label: {
    fontSize: T.caption,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  optional: { color: "#9AA9A7", fontWeight: "400" },
  helperText: {
    fontSize: T.meta,
    color: MUTED,
    marginTop: 6,
  },
  input: {
    backgroundColor: SILVER_LIGHT,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "#D1DADB",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: T.body,
    color: TEXT,
  },
  inputFocused: { borderColor: GREEN_MID, backgroundColor: "#FFFFFF" },
  inputValid: { borderColor: "#4CAF50", backgroundColor: "#FFFFFF" },
  validCheckmark: {
    position: "absolute",
    right: 14,
    color: "#4CAF50",
    fontSize: T.lead,
    fontWeight: "700",
  },
  btn: {
    backgroundColor: GREEN_MID,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
    shadowColor: "#0D2406",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  btnDisabled: { backgroundColor: "#9AA9A7", shadowOpacity: 0, elevation: 0 },
  btnText: {
    color: "#FFFFFF",
    fontSize: T.lead,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  googleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: "#D1DADB",
    backgroundColor: "#FFFFFF",
  },
  googleBtnText: {
    fontSize: T.body,
    fontWeight: "700",
    color: TEXT,
  },
  linkWrap: { marginTop: 20, alignItems: "center" },
  linkText: { fontSize: T.body, color: MUTED },
  linkBold: { color: GREEN_MID, fontWeight: "700" },
  bottomNote: {
    fontSize: T.caption,
    color: "rgba(200,225,200,0.4)",
    textAlign: "center",
    marginTop: 24,
    maxWidth: 480,
  },
});
