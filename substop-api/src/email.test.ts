import assert from "node:assert/strict";
import test from "node:test";
import { LOGIN_SUBJECT, REGISTER_SUBJECT, deviceSummary, loginBody, registerBody } from "./email.ts";

const CHROME_WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

test("registration email text is exact", () => {
  assert.equal(REGISTER_SUBJECT, "Köszönjük, hogy a SubStopot választottad!");
  assert.equal(registerBody(), `Szia!

Köszönjük, hogy regisztráltál, és a SubStopot választottad! Ha bármi kérdésed van, csak válaszolj erre a levélre.

Üdv,
a SubStop csapat
`);
});

test("login email keeps the approved text and adds time plus device after the welcome", () => {
  assert.equal(LOGIN_SUBJECT, "Új bejelentkezés a SubStop fiókodba");
  const text = loginBody(new Date(Date.UTC(2026, 10, 7, 9, 36)), CHROME_WINDOWS);
  const lines = text.split("\n");
  assert.deepEqual(lines.slice(0, 3), [
    "Szia!",
    "",
    "Új bejelentkezést észleltünk a fiókodban. Üdvözlünk az új eszközödön!",
  ]);
  assert.match(lines[3], /Europe\/Budapest/);
  assert.match(lines[3], /10:36/);
  assert.match(lines[3], /Eszköz: Chrome, Windows\.$/);
  assert.deepEqual(lines.slice(4), [
    "",
    "Ha nem te voltál, kérjük, azonnal változtasd meg a jelszavad, és írj nekünk.",
    "",
    "Üdv,",
    "a SubStop csapat",
    "",
  ]);
});

test("device summary reads a short browser and OS", () => {
  assert.equal(deviceSummary(CHROME_WINDOWS), "Eszköz: Chrome, Windows.");
  assert.equal(
    deviceSummary("Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"),
    "Eszköz: Firefox, macOS.",
  );
  assert.equal(
    deviceSummary("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"),
    "Eszköz: Safari, iOS.",
  );
  assert.equal(deviceSummary("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"), "Eszköz: Chrome, Android.");
  assert.equal(deviceSummary(""), "Eszköz: ismeretlen böngésző, ismeretlen rendszer.");
});
