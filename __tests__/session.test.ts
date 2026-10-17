// Provjera isteka prijave iz samog tokena.

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));
jest.mock("../app/config/sentry", () => ({ setSentryUser: jest.fn() }));

import { isTokenExpired } from "../utils/session";

const makeToken = (exp?: number) => {
  const payload = Buffer.from(JSON.stringify(exp === undefined ? {} : { exp }))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `h.${payload}.s`;
};
const nowSec = () => Math.floor(Date.now() / 1000);

describe("isTokenExpired", () => {
  it("nema tokena = istekao", () => {
    expect(isTokenExpired(null)).toBe(true);
    expect(isTokenExpired("")).toBe(true);
  });
  it("token koji vrijedi još sat vremena nije istekao", () => {
    expect(isTokenExpired(makeToken(nowSec() + 3600))).toBe(false);
  });
  it("istekao token je istekao", () => {
    expect(isTokenExpired(makeToken(nowSec() - 10))).toBe(true);
  });
  it("token koji istječe za 30 s se već smatra isteklim (zaliha od minute)", () => {
    expect(isTokenExpired(makeToken(nowSec() + 30))).toBe(true);
  });
  it("token bez čitljivog roka NE smatra se isteklim (neka presudi poslužitelj)", () => {
    expect(isTokenExpired(makeToken())).toBe(false);
    expect(isTokenExpired("nije-jwt")).toBe(false);
  });
});
