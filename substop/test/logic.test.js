const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const logic = require("../js/logic.js");
const i18n = require("../js/i18n.js");

const today = new Date(2026, 10, 7);

function sub(overrides) {
  return Object.assign({
    id: "11111111-1111-1111-1111-111111111111",
    name: "Filmklub",
    price: 4990,
    currency: "HUF",
    cycle: "monthly",
    nextCharge: "2026-12-01"
  }, overrides);
}

test("days and highlight tiers", function () {
  assert.equal(logic.daysUntil("2026-11-07", today), 0);
  assert.equal(logic.daysUntil("2026-11-08", today), 1);
  assert.equal(logic.daysUntil("2026-11-10", today), 3);
  assert.equal(logic.daysUntil("2026-11-11", today), 4);
  assert.equal(logic.daysUntil("2026-11-06", today), -1);
  assert.equal(logic.tierFor(0), "today");
  assert.equal(logic.tierFor(1), "soon");
  assert.equal(logic.tierFor(3), "soon");
  assert.equal(logic.tierFor(4), "later");
  assert.equal(logic.tierFor(-2), "overdue");
  assert.equal(logic.daysUntil("2026-02-31", today), null);
});

test("sorts by next charge then name", function () {
  var sorted = logic.sortByNextCharge([
    sub({ name: "Zene", nextCharge: "2026-11-20" }),
    sub({ name: "béta", nextCharge: "2026-11-08" }),
    sub({ name: "Alma", nextCharge: "2026-11-08" })
  ]);
  assert.deepEqual(sorted.map(function (item) { return item.name; }), ["Alma", "béta", "Zene"]);
});

test("monthly total skips trials and splits currencies", function () {
  var totals = logic.monthlyTotals([
    sub({ price: 4990, cycle: "monthly", currency: "HUF" }),
    sub({ price: 12000, cycle: "yearly", currency: "HUF" }),
    sub({ price: 3000, cycle: "trial", currency: "HUF" }),
    sub({ price: 12.5, cycle: "monthly", currency: "EUR" })
  ]);
  assert.deepEqual(totals, [
    { currency: "HUF", amount: 5990 },
    { currency: "EUR", amount: 12.5 }
  ]);
  assert.equal(logic.trialCount([sub({ cycle: "trial" }), sub({})]), 1);
  assert.equal(logic.monthlyAmount(sub({ price: 3600, cycle: "yearly" })), 300);
});

test("free plan stops at 3", function () {
  assert.equal(logic.FREE_LIMIT, 3);
  assert.equal(logic.canAdd([1, 2]), true);
  assert.equal(logic.canAdd([1, 2, 3]), false);
  assert.equal(logic.canAdd([]), true);
});

test("validates subscription input", function () {
  var ok = logic.validateSub({
    name: "  Őszi zene  ",
    price: "4 990",
    currency: "huf",
    cycle: "yearly",
    nextCharge: "2026-11-09"
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.name, "Őszi zene");
  assert.equal(ok.value.price, 4990);
  assert.equal(ok.value.currency, "HUF");
  assert.equal(logic.validateSub({ name: "A", price: "12,99", currency: "EUR", cycle: "monthly", nextCharge: "2026-11-09" }).value.price, 12.99);
  assert.equal(logic.validateSub({ name: "", price: "10", currency: "HUF", cycle: "monthly", nextCharge: "2026-11-09" }).error, "name");
  assert.equal(logic.validateSub({ name: "A", price: "-1", currency: "HUF", cycle: "monthly", nextCharge: "2026-11-09" }).error, "price");
  assert.equal(logic.validateSub({ name: "A", price: "1,999", currency: "HUF", cycle: "monthly", nextCharge: "2026-11-09" }).error, "price");
  assert.equal(logic.validateSub({ name: "A", price: "10", currency: "HUF", cycle: "monthly", nextCharge: "2026-02-31" }).error, "date");
  assert.equal(logic.validateSub({ name: "A", price: "10", currency: "CHF", cycle: "monthly", nextCharge: "2026-11-09" }).error, "currency");
  assert.equal(logic.isStoredSub(sub()), true);
  assert.equal(logic.isStoredSub(Object.assign(sub(), { id: "" })), false);
});

test("calendar reminder is one day before the charge", function () {
  var named = sub({ name: "Disney, Plus", cycle: "monthly", nextCharge: "2026-12-01" });
  var ics = logic.buildIcs(named, {
    now: new Date(Date.UTC(2026, 10, 7, 12, 0, 0)),
    summary: "Disney, Plus — 4 990 Ft (havi)",
    description: "Emlékeztető: 2026-12-01",
    alarm: "Holnap terhelés: Disney, Plus"
  });
  assert.equal(ics.charCodeAt(0), 0xfeff);
  var body = ics.slice(1);
  assert.match(body, /DTSTART:20261201T090000/);
  assert.match(body, /TRIGGER:-P1D/);
  assert.match(body, /RRULE:FREQ=MONTHLY/);
  assert.doesNotMatch(body, /FREQ=YEARLY/);
  assert.match(body, /Disney\\, Plus/);
  assert.match(body, /DTSTAMP:20261107T120000Z/);
  body.split("\r\n").forEach(function (line) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, line);
  });

  var trial = logic.buildIcs(sub({ cycle: "trial" }), { now: new Date(Date.UTC(2026, 10, 7, 12, 0, 0)) });
  assert.doesNotMatch(trial, /RRULE:/);
  var yearly = logic.buildIcs(sub({ cycle: "yearly" }), { now: new Date(Date.UTC(2026, 10, 7, 12, 0, 0)) });
  assert.match(yearly, /RRULE:FREQ=YEARLY/);
});

test("slug, email, and money format", function () {
  assert.equal(logic.slug("Őszi zene!"), "oszi-zene");
  assert.equal(logic.slug("!!!"), "subscription");
  assert.equal(logic.isEmail("a@b.co"), true);
  assert.equal(logic.isEmail("not-an-email"), false);
  assert.match(logic.formatMoney(4990, "HUF", "hu"), /4[\s\u00a0\u202f]?990/);
  assert.match(logic.formatMoney(4990, "HUF", "hu"), /Ft/);
  assert.match(logic.formatMoney(12.5, "EUR", "en"), /12\.50/);
});

test("locales and page copy keys match", function () {
  var hu = Object.keys(i18n.STR.hu).sort();
  var en = Object.keys(i18n.STR.en).sort();
  assert.deepEqual(hu, en);
  assert.equal(i18n.t("en", "hero.title"), "Never pay for a subscription you forgot to cancel");
  assert.match(i18n.t("hu", "hero.title"), /elfelejtettél lemondani/);
  assert.equal(i18n.t("en", "pro.thanks", { email: "a@b.co" }), "Saved on this device: a@b.co. Nothing was sent — Pro cannot be purchased yet.");

  var root = path.join(__dirname, "..");
  var html = fs.readFileSync(path.join(root, "index.html"), "utf8") + fs.readFileSync(path.join(root, "app.html"), "utf8");
  var keys = [];
  var attr = /data-i18n(?:-placeholder|-aria|-title)?="([^"]+)"/g;
  var match;
  while ((match = attr.exec(html))) keys.push(match[1]);
  var title = /data-title-key="([^"]+)"/g;
  while ((match = title.exec(html))) keys.push(match[1]);
  keys.forEach(function (key) {
    assert.equal(typeof i18n.STR.hu[key], "string", key);
  });

  var js = fs.readFileSync(path.join(root, "js/main.js"), "utf8");
  var used = /\bt\(\s*"([^"]+)"/g;
  while ((match = used.exec(js))) {
    if (match[1].endsWith(".")) continue;
    assert.equal(typeof i18n.STR.hu[match[1]], "string", match[1]);
  }
  ["cycle.monthly", "cycle.yearly", "cycle.trial", "err.name", "err.price", "err.date", "err.currency", "err.cycle"].forEach(function (key) {
    assert.equal(typeof i18n.STR.hu[key], "string", key);
  });
});
