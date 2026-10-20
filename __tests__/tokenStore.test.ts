// Prijavni token: sigurno spremište, selidba sa starog mjesta, rezerva.

import AsyncStorage from "@react-native-async-storage/async-storage";

const mockSecure: Record<string, string> = {};
let mockSecureBroken = false;

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (k: string) => {
    if (mockSecureBroken) throw new Error("keystore unavailable");
    return mockSecure[k] ?? null;
  }),
  setItemAsync: jest.fn(async (k: string, v: string) => {
    if (mockSecureBroken) throw new Error("keystore unavailable");
    mockSecure[k] = v;
  }),
  deleteItemAsync: jest.fn(async (k: string) => {
    if (mockSecureBroken) throw new Error("keystore unavailable");
    delete mockSecure[k];
  }),
}));

import {
  __resetTokenCacheForTests,
  clearToken,
  getToken,
  setToken,
} from "../utils/tokenStore";

beforeEach(async () => {
  for (const k of Object.keys(mockSecure)) delete mockSecure[k];
  mockSecureBroken = false;
  await AsyncStorage.clear();
  __resetTokenCacheForTests();
});

describe("tokenStore", () => {
  it("sprema token u SecureStore, ne u AsyncStorage", async () => {
    await setToken("abc");
    expect(mockSecure.token).toBe("abc");
    expect(await AsyncStorage.getItem("token")).toBeNull();
    expect(await getToken()).toBe("abc");
  });

  it("sele postojeći token iz AsyncStorage-a u SecureStore (nitko nije odjavljen)", async () => {
    await AsyncStorage.setItem("token", "stari-token");

    expect(await getToken()).toBe("stari-token");
    expect(mockSecure.token).toBe("stari-token");
    expect(await AsyncStorage.getItem("token")).toBeNull();
  });

  it("vraća null kad tokena nema", async () => {
    expect(await getToken()).toBeNull();
  });

  it("clearToken briše oba mjesta", async () => {
    await setToken("abc");
    await AsyncStorage.setItem("token", "ostatak");
    await clearToken();

    expect(mockSecure.token).toBeUndefined();
    expect(await AsyncStorage.getItem("token")).toBeNull();
    expect(await getToken()).toBeNull();
  });

  it("kad Keystore ne radi, koristi AsyncStorage kao rezervu", async () => {
    mockSecureBroken = true;

    await setToken("rezerva");
    expect(await AsyncStorage.getItem("token")).toBe("rezerva");

    __resetTokenCacheForTests();
    expect(await getToken()).toBe("rezerva");
  });

  it("nakon odjave ne vraća stari token iz memorije", async () => {
    await setToken("abc");
    expect(await getToken()).toBe("abc");
    await clearToken();
    expect(await getToken()).toBeNull();
  });
});
