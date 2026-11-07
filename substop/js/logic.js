(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SubStopLogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var FREE_LIMIT = 3;
  var CURRENCIES = ["HUF", "EUR", "USD", "GBP"];
  var CYCLES = ["monthly", "yearly", "trial"];

  function parseISODate(iso) {
    if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    var parts = iso.split("-");
    var y = Number(parts[0]);
    var m = Number(parts[1]);
    var d = Number(parts[2]);
    var date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }

  function isoDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, "0");
    var d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function daysUntil(iso, today) {
    var target = parseISODate(iso);
    if (!target) return null;
    var base = startOfDay(today || new Date());
    return Math.round((target.getTime() - base.getTime()) / 86400000);
  }

  function tierFor(days) {
    if (days == null) return "later";
    if (days < 0) return "overdue";
    if (days === 0) return "today";
    if (days <= 3) return "soon";
    return "later";
  }

  function sortByNextCharge(subs) {
    return subs.slice().sort(function (a, b) {
      if (a.nextCharge !== b.nextCharge) return a.nextCharge < b.nextCharge ? -1 : 1;
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
    });
  }

  function parsePrice(raw) {
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw < 0 || raw > 100000000) return null;
      return Math.round(raw * 100) / 100;
    }
    var s = String(raw == null ? "" : raw).trim().replace(/\s/g, "").replace(",", ".");
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    var n = Number(s);
    if (n > 100000000) return null;
    return n;
  }

  function monthlyAmount(sub) {
    if (!sub || sub.cycle === "trial") return 0;
    var price = typeof sub.price === "number" ? sub.price : parsePrice(sub.price);
    if (price == null) return 0;
    var raw = sub.cycle === "yearly" ? price / 12 : price;
    return Math.round(raw * 100) / 100;
  }

  function monthlyTotals(subs) {
    var map = Object.create(null);
    subs.forEach(function (sub) {
      if (!sub || sub.cycle === "trial") return;
      var amount = monthlyAmount(sub);
      var currency = sub.currency;
      map[currency] = (map[currency] || 0) + amount;
    });
    return Object.keys(map)
      .map(function (currency) {
        return { currency: currency, amount: Math.round(map[currency] * 100) / 100 };
      })
      .sort(function (a, b) {
        if (a.currency === "HUF") return -1;
        if (b.currency === "HUF") return 1;
        return a.currency.localeCompare(b.currency);
      });
  }

  function trialCount(subs) {
    return subs.filter(function (sub) { return sub && sub.cycle === "trial"; }).length;
  }

  function canAdd(subs, limit) {
    var max = typeof limit === "number" ? limit : FREE_LIMIT;
    return Array.isArray(subs) && subs.length < max;
  }

  function validateSub(input) {
    var source = input || {};
    var name = String(source.name == null ? "" : source.name).trim();
    if (!name || name.length > 80) return { ok: false, error: "name" };
    var price = parsePrice(source.price);
    if (price == null) return { ok: false, error: "price" };
    var currency = String(source.currency || "HUF").trim().toUpperCase();
    if (CURRENCIES.indexOf(currency) === -1) return { ok: false, error: "currency" };
    var cycle = source.cycle;
    if (CYCLES.indexOf(cycle) === -1) return { ok: false, error: "cycle" };
    if (!parseISODate(source.nextCharge)) return { ok: false, error: "date" };
    return {
      ok: true,
      value: {
        name: name,
        price: price,
        currency: currency,
        cycle: cycle,
        nextCharge: source.nextCharge
      }
    };
  }

  function isStoredSub(sub) {
    if (!sub || typeof sub !== "object") return false;
    if (typeof sub.id !== "string" || sub.id.length < 1 || sub.id.length > 80) return false;
    return validateSub(sub).ok;
  }

  function decorate(subs, today) {
    return sortByNextCharge(subs).map(function (sub) {
      var days = daysUntil(sub.nextCharge, today);
      return Object.assign({}, sub, {
        days: days,
        tier: tierFor(days),
        monthly: monthlyAmount(sub)
      });
    });
  }

function formatMoney(amount, currency, lang) {
  var locale = lang === "en" ? "en-GB" : "hu-HU";
  var fraction = currency === "HUF" ? (Number.isInteger(amount) ? 0 : 2) : 2;
  var options = {
    style: "currency",
    currency: currency,
    minimumFractionDigits: fraction,
    maximumFractionDigits: fraction,
    useGrouping: "always"
  };
  try {
    return new Intl.NumberFormat(locale, options).format(amount);
  } catch (err) {
    try {
      options.useGrouping = true;
      return new Intl.NumberFormat(locale, options).format(amount);
    } catch (err2) {
      return (Math.round(amount * 100) / 100) + " " + currency;
    }
  }
}

  function escapeIcs(text) {
    return String(text)
      .replace(/\\/g, "\\\\")
      .replace(/\r\n|\n|\r/g, "\\n")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,");
  }

  function foldLine(line) {
    var encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;
    var parts = [];
    var buf = "";
    var size = 0;
    var limit = 75;
    for (var ch of line) {
      var n = encoder.encode(ch).length;
      if (size + n > limit && buf) {
        parts.push(buf);
        buf = "";
        size = 0;
        limit = 74;
      }
      buf += ch;
      size += n;
    }
    if (buf) parts.push(buf);
    return parts.map(function (part, i) { return i === 0 ? part : " " + part; }).join("\r\n");
  }

  function icsUtc(date) {
    var p = function (n) { return String(n).padStart(2, "0"); };
    return date.getUTCFullYear() + p(date.getUTCMonth() + 1) + p(date.getUTCDate()) +
      "T" + p(date.getUTCHours()) + p(date.getUTCMinutes()) + p(date.getUTCSeconds()) + "Z";
  }

  function buildIcs(sub, opts) {
    var options = opts || {};
    var now = options.now || new Date();
    var stamp = sub.nextCharge.replace(/-/g, "");
    var summary = options.summary || sub.name;
    var description = options.description || "";
    var alarm = options.alarm || summary;
    var lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//SubStop//Subscription Reminder//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:SubStop",
      "BEGIN:VEVENT",
      "UID:" + escapeIcs("substop-" + sub.id + "@substop.net"),
      "DTSTAMP:" + icsUtc(now),
      "DTSTART:" + stamp + "T090000",
      "DTEND:" + stamp + "T091500",
      "SUMMARY:" + escapeIcs(summary),
      "DESCRIPTION:" + escapeIcs(description),
      "TRANSP:TRANSPARENT"
    ];
    if (sub.cycle === "monthly") lines.push("RRULE:FREQ=MONTHLY");
    if (sub.cycle === "yearly") lines.push("RRULE:FREQ=YEARLY");
    lines.push(
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + escapeIcs(alarm),
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR"
    );
    return "\uFEFF" + lines.map(foldLine).join("\r\n") + "\r\n";
  }

  function slug(name) {
    var s = String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return s || "subscription";
  }

  function isEmail(value) {
    if (typeof value !== "string") return false;
    var s = value.trim();
    if (s.length < 6 || s.length > 120) return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function uid() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }
    return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  return {
    FREE_LIMIT: FREE_LIMIT,
    CURRENCIES: CURRENCIES,
    CYCLES: CYCLES,
    parseISODate: parseISODate,
    isoDate: isoDate,
    daysUntil: daysUntil,
    tierFor: tierFor,
    sortByNextCharge: sortByNextCharge,
    parsePrice: parsePrice,
    monthlyAmount: monthlyAmount,
    monthlyTotals: monthlyTotals,
    trialCount: trialCount,
    canAdd: canAdd,
    validateSub: validateSub,
    isStoredSub: isStoredSub,
    decorate: decorate,
    formatMoney: formatMoney,
    escapeIcs: escapeIcs,
    buildIcs: buildIcs,
    slug: slug,
    isEmail: isEmail,
    uid: uid
  };
});
