import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { API_ENDPOINTS } from "./config/api";
import { useKeyboardOverlap } from "../hooks/use-keyboard-offset";
import { T } from "../styles/varaTheme";

type Step = "email" | "code" | "newPassword";

/** Poslužitelj ne šalje novi kod češće od jednom u minuti (isti razmak ovdje). */
const RESEND_SECONDS = 60;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Jednokratna dozvola koju poslužitelj izda tek kad provjeri 6-znamenkasti kod.
  const [resetToken, setResetToken] = useState("");
  const [contact, setContact] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Odbrojavanje do ponovnog slanja. Dok traje, poslužitelj bi zahtjev tiho
  // preskočio (isti odgovor, bez e-maila) — pa se gumb do tada ne nudi, da
  // korisnik ne dobije "kod poslan" za poruku koja nikad nije poslana.
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const handleRequestCode = async () => {
    if (!contact.trim()) {
      Alert.alert(t("common.error"), t("validation.enterEmail"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.FORGOT_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: contact.trim() }),
      });

      if (response.ok) {
        setEmail(contact.trim());
        setCode("");
        setStep("code");
        setSecondsLeft(RESEND_SECONDS);
        Alert.alert(
          t("forgotPassword.codeSentTitle"),
          t("forgotPassword.codeSentDesc", { contact }) +
            "\n\n" +
            t("forgotPassword.checkSpamNote"),
        );
      } else if (response.status === 429) {
        Alert.alert(t("common.error"), t("common.tooManyRequests"));
      } else if (response.status === 503) {
        // Poslužitelj ne može poslati e-mail (kvar pružatelja pošte).
        Alert.alert(t("common.error"), t("forgotPassword.emailUnavailable"));
      } else {
        Alert.alert(t("common.error"), t("forgotPassword.tryAgain"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  // "Pošalji novi kod" na koraku unosa koda: kod nije stigao, istekao je ili je
  // potrošeno 5 pokušaja. Novi kod poništava stari, pa se polje čisti.
  const handleResendCode = async () => {
    if (secondsLeft > 0 || isLoading) return;
    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.FORGOT_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: (email || contact).trim() }),
      });
      if (response.ok) {
        setCode("");
        setSecondsLeft(RESEND_SECONDS);
        Alert.alert(
          t("forgotPassword.codeSentTitle"),
          t("forgotPassword.resent") +
            "\n\n" +
            t("forgotPassword.checkSpamNote"),
        );
      } else if (response.status === 429) {
        Alert.alert(t("common.error"), t("common.tooManyRequests"));
      } else {
        Alert.alert(t("common.error"), t("forgotPassword.tryAgain"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  // Kod se provjerava na poslužitelju PRIJE ekrana za novu lozinku. Dosad je
  // ovdje bilo samo "ima li 6 znamenki", pa je pogrešan kod korisnik saznao
  // tek nakon što je smislio i dvaput upisao novu lozinku. Uz to poslužitelj
  // broji pogrešne pokušaje (5) i nakon toga poništava kod.
  const handleVerifyCode = async () => {
    if (code.trim().length !== 6) {
      Alert.alert(t("common.error"), t("forgotPassword.enterCode"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.VERIFY_RESET_CODE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: (email || contact).trim(),
          code: code.trim(),
        }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        if (!data?.resetToken) {
          Alert.alert(t("common.error"), t("forgotPassword.tryAgain"));
          return;
        }
        setResetToken(data.resetToken);
        setStep("newPassword");
      } else if (response.status === 429) {
        Alert.alert(t("common.error"), t("common.tooManyRequests"));
      } else {
        Alert.alert(t("common.error"), t("forgotPassword.invalidCode"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (newPassword.length < 6) {
      Alert.alert(t("common.error"), t("validation.passwordMin"));
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t("common.error"), t("auth.passwordMismatch"));
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.RESET_PASSWORD, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Umjesto šest znamenki šalje se dozvola koju je poslužitelj izdao
        // nakon što je kod provjerio; veže se uz e-mail baš tog računa.
        body: JSON.stringify({
          email: (email || contact).trim(),
          resetToken,
          newPassword,
        }),
      });
      if (response.ok) {
        Alert.alert(
          t("forgotPassword.successTitle"),
          t("forgotPassword.successDesc"),
          [
            {
              text: t("auth.loginBtn"),
              onPress: () => router.replace("/login"),
            },
          ],
        );
      } else {
        // Dozvola je istekla (10 min) ili je neispravna: treba novi kod.
        setResetToken("");
        setCode("");
        setStep("email");
        Alert.alert(t("common.error"), t("forgotPassword.invalidCode"));
      }
    } catch {
      Alert.alert(t("common.error"), t("common.networkError"));
    } finally {
      setIsLoading(false);
    }
  };

  const STEPS = {
    email: {
      title: t("forgotPassword.step1Title"),
      subtitle: t("forgotPassword.step1Desc"),
      icon: "📧",
    },
    code: {
      title: t("forgotPassword.step2Title"),
      subtitle: t("forgotPassword.step2Desc", { email }),
      icon: "🔢",
    },
    newPassword: {
      title: t("forgotPassword.step3Title"),
      subtitle: t("forgotPassword.step3Desc"),
      icon: "🔐",
    },
  };

  const current = STEPS[step];

  // Tipkovnica je prekrivala polje za e-mail: kartica je centrirana i dovoljno
  // visoka da joj donji dio (polje + gumb) završi ispod tipkovnice. Mjeri se
  // koliko tipkovnica STVARNO prekriva, taj se razmak doda na dno i sadržaj se
  // pomakne do kraja — polje i gumb ostaju iznad tipkovnice.
  const scrollRef = useRef<ScrollView>(null);
  const areaRef = useRef<View>(null);
  const keyboardOverlap = useKeyboardOverlap(areaRef);
  useEffect(() => {
    if (keyboardOverlap <= 0) return;
    const id = setTimeout(
      () => scrollRef.current?.scrollToEnd({ animated: true }),
      120,
    );
    return () => clearTimeout(id);
  }, [keyboardOverlap, step]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
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
      <View
        ref={areaRef}
        collapsable={false}
        style={{ flex: 1, paddingBottom: keyboardOverlap }}
      >
        <StatusBar barStyle="light-content" backgroundColor="#0D2406" />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* Progress dots */}
            <View style={styles.progress}>
              {(["email", "code", "newPassword"] as Step[]).map((s, i) => (
                <View
                  key={s}
                  style={[
                    styles.dot,
                    step === s && styles.dotActive,
                    (step === "code" && i === 0) ||
                    (step === "newPassword" && i <= 1)
                      ? styles.dotDone
                      : null,
                  ]}
                />
              ))}
            </View>

            <Text style={styles.icon}>{current.icon}</Text>
            <Text style={styles.title}>{current.title}</Text>
            <Text style={styles.subtitle}>{current.subtitle}</Text>

            {/* EMAIL korak */}
            {step === "email" && (
              <View style={styles.form}>
                <Text style={styles.label}>
                  {t("forgotPassword.emailLabel")}
                </Text>
                <TextInput
                  selectTextOnFocus
                  style={styles.input}
                  placeholder={t("forgotPassword.emailPlaceholder")}
                  placeholderTextColor="#9AA9A7"
                  value={contact}
                  onChangeText={setContact}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                  editable={!isLoading}
                />
                <TouchableOpacity
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleRequestCode}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {t("forgotPassword.sendCode")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* KOD korak */}
            {step === "code" && (
              <View style={styles.form}>
                <Text style={styles.label}>
                  {t("forgotPassword.codeLabel")}
                </Text>
                <TextInput
                  selectTextOnFocus
                  style={[styles.input, styles.codeInput]}
                  placeholder="123456"
                  placeholderTextColor="#9AA9A7"
                  value={code}
                  onChangeText={(t) =>
                    setCode(t.replace(/\D/g, "").slice(0, 6))
                  }
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleVerifyCode}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {t("forgotPassword.verifyCode")}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={handleResendCode}
                  disabled={secondsLeft > 0 || isLoading}
                >
                  <Text
                    style={[
                      styles.resendText,
                      secondsLeft > 0 && styles.resendTextDisabled,
                    ]}
                  >
                    {secondsLeft > 0
                      ? t("forgotPassword.resendIn", { s: secondsLeft })
                      : t("forgotPassword.resendNow")}
                  </Text>
                </TouchableOpacity>
                {/* Pogrešna adresa: natrag na unos e-maila i cijeli postupak ispočetka. */}
                <TouchableOpacity
                  style={styles.resendBtn}
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setResetToken("");
                  }}
                >
                  <Text style={styles.resendText}>
                    {t("forgotPassword.changeEmail")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* NOVA LOZINKA korak */}
            {step === "newPassword" && (
              <View style={styles.form}>
                <Text style={styles.label}>
                  {t("forgotPassword.newPasswordLabel")}
                </Text>
                <View
                  style={{ position: "relative", justifyContent: "center" }}
                >
                  <TextInput
                    selectTextOnFocus
                    style={styles.input}
                    placeholder={t("forgotPassword.newPasswordPlaceholder")}
                    placeholderTextColor="#9AA9A7"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    autoFocus
                    editable={!isLoading}
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
                    onPress={() => setShowNewPassword((v) => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text
                      style={{
                        fontSize: T.title,
                        opacity: showNewPassword ? 1 : 0.5,
                      }}
                    >
                      👁️
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.label, { marginTop: 12 }]}>
                  {t("forgotPassword.confirmPasswordLabel")}
                </Text>
                <View
                  style={{ position: "relative", justifyContent: "center" }}
                >
                  <TextInput
                    selectTextOnFocus
                    style={[
                      styles.input,
                      confirmPassword && newPassword !== confirmPassword
                        ? styles.inputError
                        : null,
                    ]}
                    placeholder={t("forgotPassword.confirmPasswordPlaceholder")}
                    placeholderTextColor="#9AA9A7"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirmPassword}
                    editable={!isLoading}
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
                    <Text
                      style={{
                        fontSize: T.title,
                        opacity: showConfirmPassword ? 1 : 0.5,
                      }}
                    >
                      👁️
                    </Text>
                  </TouchableOpacity>
                </View>
                {confirmPassword && newPassword !== confirmPassword && (
                  <Text style={styles.errorText}>
                    {t("auth.passwordMismatch")}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.button, isLoading && styles.buttonDisabled]}
                  onPress={handleResetPassword}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>
                      {t("forgotPassword.changePasswordBtn")}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.backText}>
                {t("forgotPassword.backToLogin")}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

// Ista paleta kao login.tsx/register.tsx — prije je ovaj ekran koristio
// posve drugu (svijetloplavu/ljubičastu #667eea na sivoj #f5f7fa) shemu
// boja koja nije imala veze s ostatkom aplikacije.
const GREEN_DEEPEST = "#0D2406";
const GREEN_DARK = "#1B3F0E";
const GREEN_MID = "#2D6418";
const VALID_GREEN = "#4CAF50";
const SILVER = "#9AA9A7";
const SILVER_LIGHT = "#E8EEEE";
const TEXT_DARK = "#142F09";
const TEXT_MID = "#5C6765";

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
    backgroundColor: "#FFFFFF",
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
  progress: { flexDirection: "row", gap: 8, marginBottom: 28 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#D1DADB" },
  dotActive: { backgroundColor: GREEN_MID, width: 24 },
  dotDone: { backgroundColor: VALID_GREEN },
  icon: { fontSize: 48, marginBottom: 14 },
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
    marginBottom: 28,
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
    backgroundColor: SILVER_LIGHT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: T.lead,
    borderWidth: 1.5,
    borderColor: "#D1DADB",
    color: TEXT_DARK,
    marginBottom: 8,
  },
  inputError: { borderColor: "#C0392B" },
  codeInput: {
    textAlign: "center",
    fontSize: 28,
    fontWeight: "bold",
    letterSpacing: 12,
  },
  button: {
    backgroundColor: GREEN_MID,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 12,
    alignItems: "center",
    shadowColor: GREEN_DEEPEST,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  buttonDisabled: { backgroundColor: SILVER, shadowOpacity: 0, elevation: 0 },
  buttonText: {
    color: "#FFFFFF",
    fontSize: T.lead,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  resendBtn: { marginTop: 16, alignItems: "center" },
  resendText: { color: GREEN_MID, fontSize: T.body, fontWeight: "600" },
  resendTextDisabled: { color: SILVER },
  backBtn: { marginTop: 28 },
  backText: { color: TEXT_MID, fontSize: T.body },
  errorText: { color: "#C0392B", fontSize: T.meta, marginBottom: 4 },
});
