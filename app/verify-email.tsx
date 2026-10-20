// app/verify-email.tsx
//
// Potvrda e-mail adrese nakon registracije (ili nakon prijave s još
// nepotvrđenim računom). Kod stiže samo na adresu upisanu pri registraciji, pa
// račun otvoren tuđom adresom ostaje zaključan.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_ENDPOINTS } from "./config/api";
import { T } from "../styles/varaTheme";
import { KeyboardSafeScrollView } from "../components/KeyboardSafeScrollView";
import { apiFetch, describeNetworkError } from "@/utils/apiFetch";
import { A } from "../styles/authTheme";
import { APP_ICONS } from "../constants/icons";

/** Poslužitelj ne šalje novi kod češće od jednom u minuti. */
const RESEND_SECONDS = 60;

export default function VerifyEmailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ email?: string; resend?: string }>();
  const email = (params.email ?? "").trim();

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Nakon registracije kod je upravo poslan; nakon prijave s nepotvrđenim
  // računom (resend=1) ga treba tražiti.
  const [secondsLeft, setSecondsLeft] = useState(
    params.resend === "1" ? 0 : RESEND_SECONDS,
  );
  const autoRequested = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const requestCode = async (silent: boolean) => {
    if (!email) return;
    try {
      const response = await apiFetch(API_ENDPOINTS.RESEND_VERIFICATION, {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.status === 429) {
        Alert.alert(t("common.error"), t("common.tooManyRequests"));
        return;
      }
      setSecondsLeft(RESEND_SECONDS);
      if (!silent) {
        Alert.alert(t("verifyEmail.title"), t("verifyEmail.resent"));
      }
    } catch (err) {
      if (!silent) Alert.alert(t("common.error"), describeNetworkError(err, t));
    }
  };

  // Dolazak s prijave: korisnik je unio ispravnu lozinku, ali nema (valjan) kod.
  useEffect(() => {
    if (params.resend === "1" && !autoRequested.current) {
      autoRequested.current = true;
      requestCode(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (code.trim().length !== 6) {
      Alert.alert(t("common.error"), t("verifyEmail.enterCode"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await apiFetch(API_ENDPOINTS.VERIFY_EMAIL, {
        method: "POST",
        auth: false,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: code.trim() }),
      });
      if (response.ok) {
        Alert.alert(
          t("verifyEmail.successTitle"),
          t("verifyEmail.successDesc"),
          [
            {
              text: t("auth.loginBtn"),
              onPress: () => router.replace("/login"),
            },
          ],
        );
      } else if (response.status === 429) {
        Alert.alert(t("common.error"), t("common.tooManyRequests"));
      } else {
        Alert.alert(t("common.error"), t("verifyEmail.invalidCode"));
      }
    } catch (err) {
      Alert.alert(t("common.error"), describeNetworkError(err, t));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={A.statusBar} />
      <KeyboardSafeScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Image
            source={APP_ICONS.authMail}
            style={styles.iconImg}
            resizeMode="contain"
          />
          <Text style={styles.title}>{t("verifyEmail.title")}</Text>
          <Text style={styles.subtitle}>
            {t("verifyEmail.subtitle", { email })}
          </Text>
          <Text style={styles.note}>{t("verifyEmail.checkSpam")}</Text>

          <View style={styles.form}>
            <Text style={styles.label}>{t("verifyEmail.codeLabel")}</Text>
            <TextInput
              selectTextOnFocus
              style={[styles.input, styles.codeInput]}
              placeholder="123456"
              placeholderTextColor={A.placeholder}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              editable={!isLoading}
            />
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={A.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>
                  {t("verifyEmail.verifyBtn")}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.resendBtn}
              onPress={() => requestCode(false)}
              disabled={secondsLeft > 0}
            >
              <Text
                style={[
                  styles.resendText,
                  secondsLeft > 0 && styles.resendTextDisabled,
                ]}
              >
                {secondsLeft > 0
                  ? t("verifyEmail.resendIn", { s: secondsLeft })
                  : t("verifyEmail.resend")}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.backText}>{t("verifyEmail.backToLogin")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardSafeScrollView>
    </KeyboardAvoidingView>
  );
}

// Ista paleta kao forgot-password.tsx / login.tsx.
const GREEN_DEEPEST = A.statusBar;
const GREEN_DARK = A.bg;
const VALID_GREEN = A.valid;
const TEXT_DARK = A.text;
const TEXT_MID = A.textDim;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GREEN_DARK },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: A.card,
    borderWidth: 1,
    borderColor: A.cardBorder,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 440,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  iconImg: { width: 76, height: 76, marginBottom: 14 },
  title: {
    fontSize: T.screen,
    fontWeight: "800",
    color: TEXT_DARK,
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: T.body,
    color: TEXT_MID,
    textAlign: "center",
    marginBottom: 8,
  },
  note: {
    fontSize: T.meta,
    color: A.textDim,
    textAlign: "center",
    marginBottom: 24,
  },
  form: { width: "100%" },
  label: {
    fontSize: T.caption,
    fontWeight: "700",
    color: TEXT_MID,
    letterSpacing: 1.2,
    marginBottom: 7,
  },
  input: {
    backgroundColor: A.inputBg,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: T.lead,
    borderWidth: 1.5,
    borderColor: A.divider,
    color: TEXT_DARK,
    marginBottom: 8,
  },
  codeInput: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 12,
  },
  button: {
    backgroundColor: A.primary,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 12,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: {
    backgroundColor: A.primaryDisabled,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    color: A.onPrimary,
    fontSize: T.lead,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  resendBtn: { marginTop: 16, alignItems: "center" },
  resendText: { color: A.accent, fontSize: T.body, fontWeight: "600" },
  resendTextDisabled: { color: A.textDim },
  backBtn: { marginTop: 28 },
  backText: { color: TEXT_MID, fontSize: T.body },
});
