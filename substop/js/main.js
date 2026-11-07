(function () {
  var KEY = "substop.v1";
  var Logic = window.SubStopLogic;
  var I18n = window.SubStopI18n;
  var Auth = window.SubStopAuth;
  var lang = "hu";
  var editingId = null;
  var deleteId = null;
  var toastTimer = 0;
  var authMode = "login";
  var authPending = false;

  function t(key, vars) {
    return I18n.t(lang, key, vars);
  }

  function emptyDB() {
    return { subs: [], lang: null, notified: {}, proEmail: "" };
  }

  function loadDB() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return emptyDB();
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return emptyDB();
      var subs = Array.isArray(data.subs) ? data.subs.filter(Logic.isStoredSub) : [];
      var notified = {};
      if (data.notified && typeof data.notified === "object") {
        Object.keys(data.notified).forEach(function (id) {
          var value = data.notified[id];
          if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) notified[id] = value;
        });
      }
      return {
        subs: subs,
        lang: data.lang === "en" || data.lang === "hu" ? data.lang : null,
        notified: notified,
        proEmail: typeof data.proEmail === "string" ? data.proEmail : ""
      };
    } catch (err) {
      return emptyDB();
    }
  }

  function showToast(message) {
    var toast = document.getElementById("toast");
    if (!toast) return;
    toast.hidden = false;
    toast.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 4200);
  }

  function saveDB(db) {
    try {
      var ids = {};
      db.subs.forEach(function (sub) { ids[sub.id] = true; });
      var notified = {};
      Object.keys(db.notified || {}).forEach(function (id) {
        if (ids[id]) notified[id] = db.notified[id];
      });
      var storedLang = db.lang === "en" ? "en" : "hu";
      localStorage.setItem(KEY, JSON.stringify({
        subs: db.subs,
        lang: storedLang,
        notified: notified,
        proEmail: db.proEmail || ""
      }));
      db.notified = notified;
      db.lang = storedLang;
      return true;
    } catch (err) {
      showToast(t("err.save"));
      return false;
    }
  }

  function currentSubs() {
    return Logic.decorate(loadDB().subs, new Date());
  }

  function relativeLabel(days) {
    if (days === 0) return t("rel.today");
    if (days === 1) return t("rel.tomorrow");
    if (days === -1) return t("rel.yesterday");
    if (days > 1) return t("rel.inDays", { n: days });
    return t("rel.overdueDays", { n: Math.abs(days) });
  }

  function formatDate(iso) {
    var date = Logic.parseISODate(iso);
    if (!date) return iso;
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "hu-HU", {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(date);
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value == null || value === false) return;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else node.setAttribute(key, value === true ? "" : String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child == null || child === false) continue;
      node.append(child);
    }
    return node;
  }

  function permState() {
    if (!window.isSecureContext || !("Notification" in window)) return "unsupported";
    return Notification.permission;
  }

  function updatePermButton() {
    var button = document.getElementById("permBtn");
    if (!button) return;
    var state = permState();
    var key = state === "granted" ? "perm.on" : state === "denied" ? "perm.denied" : state === "unsupported" ? "perm.unsupported" : "perm.default";
    var titleKey = state === "granted" ? "perm.titleOn" : state === "denied" ? "perm.titleDenied" : state === "unsupported" ? "perm.titleUnsupported" : "perm.titleDefault";
    button.textContent = t(key);
    button.title = t(titleKey);
    button.disabled = state === "granted" || state === "unsupported";
  }

  function updateAddLabels() {
    var full = !Logic.canAdd(loadDB().subs);
    var label = t(full ? "app.addFull" : "app.add");
    document.querySelectorAll("[data-add-label]").forEach(function (node) {
      node.textContent = label;
    });
  }

  function updateDateLabel() {
    var label = document.getElementById("dateLabel");
    if (!label) return;
    var selected = document.querySelector('#subForm input[name="cycle"]:checked');
    var trial = selected && selected.value === "trial";
    label.textContent = t(trial ? "form.dateTrial" : "form.date");
  }

  function refreshInterest() {
    var email = loadDB().proEmail;
    document.querySelectorAll(".js-interest").forEach(function (form) {
      var known = Logic.isEmail(email);
      var fields = form.querySelector("[data-fields]");
      var thanks = form.querySelector("[data-thanks]");
      var reset = form.querySelector("[data-reset]");
      if (known && form.dataset.editing !== "1") {
        fields.hidden = true;
        thanks.hidden = false;
        thanks.textContent = t("pro.thanks", { email: email });
        if (reset) reset.hidden = false;
      } else {
        fields.hidden = false;
        thanks.hidden = true;
        if (reset) reset.hidden = true;
        var input = form.querySelector('input[type="email"]');
        if (input && !input.value && known) input.value = email;
      }
    });
  }

  function renderStats(subs) {
    var root = document.getElementById("stats");
    if (!root) return;
    var totals = Logic.monthlyTotals(subs);
    var trials = Logic.trialCount(subs);
    var attention = subs.filter(function (sub) { return sub.tier !== "later"; }).length;
    var monthly = el("article", { class: "stat" },
      el("p", { class: "stat-label", text: t("app.monthly") })
    );
    if (!totals.length) {
      monthly.append(el("p", { class: "stat-value", text: Logic.formatMoney(0, "HUF", lang) }));
    } else {
      totals.forEach(function (row, index) {
        monthly.append(el("p", {
          class: index === 0 ? "stat-value" : "stat-extra",
          text: Logic.formatMoney(row.amount, row.currency, lang)
        }));
      });
      if (totals.length > 1) monthly.append(el("p", { class: "stat-note", text: t("app.mixed") }));
    }
    if (trials === 1) monthly.append(el("p", { class: "stat-note", text: t("app.trialOne") }));
    else if (trials > 1) monthly.append(el("p", { class: "stat-note", text: t("app.trials", { n: trials }) }));

    var slots = el("article", { class: "stat" },
      el("p", { class: "stat-label", text: t("app.slots") }),
      el("p", { class: "stat-value", text: subs.length + " / " + Logic.FREE_LIMIT }),
      el("p", { class: "stat-note", text: t("app.slotsHint") })
    );
    var watch = el("article", { class: "stat" },
      el("p", { class: "stat-label", text: t("app.attention") }),
      el("p", { class: "stat-value", text: String(attention) }),
      el("p", { class: "stat-note", text: t("app.attentionHint") })
    );
    root.replaceChildren(monthly, slots, watch);
  }

  function renderList(subs) {
    var list = document.getElementById("list");
    var empty = document.getElementById("empty");
    if (!list || !empty) return;
    if (!subs.length) {
      list.replaceChildren();
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.replaceChildren.apply(list, subs.map(renderItem));
  }

  function renderItem(sub) {
    var money = Logic.formatMoney(sub.price, sub.currency, lang);
    var when = relativeLabel(sub.days);
    var date = formatDate(sub.nextCharge);
    var tierClass = sub.tier === "later" ? "item" : "item is-" + sub.tier;
    var meta = date + " · " + when;
    if (sub.cycle === "yearly") meta += " · " + t("app.monthlyEq", { money: Logic.formatMoney(sub.monthly, sub.currency, lang) });
    if (sub.cycle === "trial") meta += " · " + t("app.trialExcluded");
    var ics = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: t("app.ics"), title: t("app.icsTitle") });
    ics.addEventListener("click", function () { downloadIcs(sub); });
    var edit = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: t("app.edit") });
    edit.addEventListener("click", function () { openForm(sub); });
    var remove = el("button", { type: "button", class: "btn btn-ghost btn-sm btn-danger", text: t("app.delete") });
    remove.addEventListener("click", function () { openDelete(sub); });
    var top = el("div", { class: "item-top" },
      el("span", { class: "pill pill-" + sub.cycle, text: t("cycle." + sub.cycle) })
    );
    if (sub.tier !== "later") top.append(el("span", { class: "pill pill-" + sub.tier, text: when }));
    var article = el("article", { class: tierClass });
    article.setAttribute("aria-label", sub.name + ", " + money + ", " + meta);
    article.append(
      top,
      el("h2", { class: "item-name", text: sub.name }),
      el("p", { class: "item-price", text: money }),
      el("p", { class: "item-meta", text: meta }),
      el("div", { class: "item-actions" }, ics, edit, remove)
    );
    return article;
  }

  function renderBanner(subs) {
    var banner = document.getElementById("banner");
    if (!banner) return;
    var attention = subs.filter(function (sub) { return sub.tier !== "later"; });
    if (!attention.length) {
      banner.hidden = true;
      banner.replaceChildren();
      return;
    }
    var sig = attention.map(function (sub) { return sub.id + "@" + sub.nextCharge; }).sort().join("|");
    if (sessionStorage.getItem("substop.bannerDismiss") === sig) {
      banner.hidden = true;
      return;
    }
    var urgent = attention.some(function (sub) { return sub.tier === "today" || sub.tier === "overdue"; });
    banner.className = "banner " + (urgent ? "is-urgent" : "is-soon");
    banner.hidden = false;
    var detail = attention.map(function (sub) {
      return sub.name + " (" + relativeLabel(sub.days) + ")";
    }).join(" · ");
    var copy = el("div", { class: "banner-copy" },
      el("p", { class: "banner-title", text: t(urgent ? "banner.urgent" : "banner.soon") }),
      el("p", { class: "banner-detail", text: detail })
    );
    var state = permState();
    if (state === "denied") copy.append(el("p", { class: "banner-note", text: t("banner.denied") }));
    if (state === "unsupported") copy.append(el("p", { class: "banner-note", text: t("banner.unsupported") }));
    var actions = el("div", { class: "banner-actions" });
    if (state === "default") {
      var enable = el("button", { type: "button", class: "btn btn-primary btn-sm", text: t("banner.enable") });
      enable.addEventListener("click", onPerm);
      actions.append(enable);
    }
    var dismiss = el("button", { type: "button", class: "btn btn-ghost btn-sm", text: t("banner.dismiss") });
    dismiss.addEventListener("click", function () {
      sessionStorage.setItem("substop.bannerDismiss", sig);
      banner.hidden = true;
    });
    actions.append(dismiss);
    banner.replaceChildren(copy, actions);
  }

  function renderDynamic() {
    var subs = currentSubs();
    renderStats(subs);
    renderList(subs);
    renderBanner(subs);
    updateAddLabels();
  }

  function downloadIcs(sub) {
    var money = Logic.formatMoney(sub.price, sub.currency, lang);
    var ics = Logic.buildIcs(sub, {
      now: new Date(),
      summary: t("ics.summary", { name: sub.name, money: money, cycle: t("cycle." + sub.cycle) }),
      description: t("ics.description", { date: formatDate(sub.nextCharge) }),
      alarm: t("ics.alarm", { name: sub.name })
    });
    var blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "substop-" + Logic.slug(sub.name) + ".ics";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function checkReminders() {
    if (permState() !== "granted") return;
    var db = loadDB();
    var today = Logic.isoDate(new Date());
    var pending = Logic.decorate(db.subs, new Date()).filter(function (sub) {
      return sub.tier !== "later" && db.notified[sub.id] !== today;
    });
    if (!pending.length) return;
    var body;
    if (pending.length === 1) {
      body = t("notif.one", {
        name: pending[0].name,
        when: relativeLabel(pending[0].days),
        money: Logic.formatMoney(pending[0].price, pending[0].currency, lang)
      });
    } else {
      var shown = pending.slice(0, 8);
      var list = shown.map(function (sub) { return sub.name + " (" + relativeLabel(sub.days) + ")"; }).join(", ");
      if (pending.length > shown.length) list += " +" + (pending.length - shown.length);
      body = t("notif.many", { n: pending.length, list: list });
    }
    try {
      var icon = new URL("icon-192.png", document.baseURI).href;
      new Notification(t("notif.title"), { body: body, tag: "substop-" + today, lang: lang === "en" ? "en" : "hu", icon: icon });
    } catch (err) {
      return;
    }
    pending.forEach(function (sub) { db.notified[sub.id] = today; });
    saveDB(db);
  }

  function onPerm() {
    if (permState() !== "default") {
      updatePermButton();
      return;
    }
    Notification.requestPermission().then(function () {
      updatePermButton();
      renderBanner(currentSubs());
      checkReminders();
    }).catch(function () {
      updatePermButton();
    });
  }

  function showFormError(code) {
    var node = document.getElementById("formError");
    node.hidden = false;
    node.dataset.code = code;
    node.textContent = t("err." + code);
    var map = { name: "name", price: "price", date: "nextCharge", currency: "currency" };
    var field = map[code] ? document.getElementById(map[code]) : document.querySelector('#subForm input[name="cycle"]');
    if (field) field.focus();
  }

  function readForm() {
    var selected = document.querySelector('#subForm input[name="cycle"]:checked');
    return {
      name: document.getElementById("name").value,
      price: document.getElementById("price").value,
      currency: document.getElementById("currency").value,
      cycle: selected ? selected.value : "",
      nextCharge: document.getElementById("nextCharge").value
    };
  }

  function openForm(sub) {
    editingId = sub ? sub.id : null;
    var form = document.getElementById("subForm");
    form.reset();
    document.getElementById("formTitle").textContent = t(sub ? "form.titleEdit" : "form.titleAdd");
    var error = document.getElementById("formError");
    error.hidden = true;
    error.dataset.code = "";
    if (sub) {
      document.getElementById("name").value = sub.name;
      var price = String(sub.price);
      document.getElementById("price").value = lang === "hu" ? price.replace(".", ",") : price;
      document.getElementById("currency").value = sub.currency;
      var radio = document.querySelector('#subForm input[name="cycle"][value="' + sub.cycle + '"]');
      if (radio) radio.checked = true;
      document.getElementById("nextCharge").value = sub.nextCharge;
    } else {
      document.getElementById("currency").value = "HUF";
      document.querySelector('#subForm input[name="cycle"][value="monthly"]').checked = true;
    }
    updateDateLabel();
    var dialog = document.getElementById("formDialog");
    if (!dialog.open) dialog.showModal();
    document.getElementById("name").focus();
  }

  function onAddClick() {
    if (!Logic.canAdd(loadDB().subs)) {
      openUpsell();
      return;
    }
    openForm(null);
  }

  function onSubmit(event) {
    event.preventDefault();
    var result = Logic.validateSub(readForm());
    if (!result.ok) {
      showFormError(result.error);
      return;
    }
    var db = loadDB();
    if (!editingId && !Logic.canAdd(db.subs)) {
      document.getElementById("formDialog").close();
      openUpsell();
      return;
    }
    if (editingId) {
      db.subs = db.subs.map(function (sub) {
        return sub.id === editingId ? Object.assign({}, sub, result.value) : sub;
      });
    } else {
      db.subs = db.subs.concat([Object.assign({ id: Logic.uid(), createdAt: Date.now() }, result.value)]);
    }
    if (!saveDB(db)) return;
    editingId = null;
    document.getElementById("formDialog").close();
    renderDynamic();
    checkReminders();
  }

  function openDelete(sub) {
    deleteId = sub.id;
    document.getElementById("deleteBody").textContent = t("delete.body", { name: sub.name });
    var dialog = document.getElementById("deleteDialog");
    if (!dialog.open) dialog.showModal();
  }

  function confirmDelete() {
    if (!deleteId) return;
    var db = loadDB();
    db.subs = db.subs.filter(function (sub) { return sub.id !== deleteId; });
    delete db.notified[deleteId];
    if (!saveDB(db)) return;
    deleteId = null;
    document.getElementById("deleteDialog").close();
    renderDynamic();
  }

  function openUpsell() {
    refreshInterest();
    var dialog = document.getElementById("upsellDialog");
    if (dialog && !dialog.open) dialog.showModal();
  }

  function refreshOpenDialogCopy() {
    var formTitle = document.getElementById("formTitle");
    if (formTitle && document.getElementById("formDialog").open) {
      formTitle.textContent = t(editingId ? "form.titleEdit" : "form.titleAdd");
    }
    var error = document.getElementById("formError");
    if (error && !error.hidden && error.dataset.code) error.textContent = t("err." + error.dataset.code);
    if (deleteId && document.getElementById("deleteDialog").open) {
      var sub = loadDB().subs.filter(function (item) { return item.id === deleteId; })[0];
      if (sub) document.getElementById("deleteBody").textContent = t("delete.body", { name: sub.name });
    }
  }

  function onInterest(event) {
    event.preventDefault();
    var form = event.currentTarget;
    var input = form.querySelector('input[type="email"]');
    var err = form.querySelector("[data-error]");
    var email = input.value.trim();
    if (!Logic.isEmail(email)) {
      err.hidden = false;
      err.textContent = t("pro.invalidEmail");
      input.focus();
      return;
    }
    err.hidden = true;
    var db = loadDB();
    db.proEmail = email;
    if (!saveDB(db)) {
      err.hidden = false;
      err.textContent = t("err.save");
      return;
    }
    form.dataset.editing = "";
    refreshInterest();
  }

  function bindBackdrop(dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });
  }

  function applyLanguage() {
    document.documentElement.lang = lang;
    I18n.apply(lang);
    var titleKey = document.body.dataset.titleKey;
    if (titleKey) document.title = t(titleKey);
    document.querySelectorAll("[data-set-lang]").forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.setLang === lang ? "true" : "false");
    });
    refreshInterest();
    renderAccount();
    renderAuthDialog();
    if (document.body.dataset.page === "app") {
      updatePermButton();
      updateDateLabel();
      renderDynamic();
      refreshOpenDialogCopy();
    }
  }

  function bindLang() {
    document.querySelectorAll("[data-set-lang]").forEach(function (button) {
      button.addEventListener("click", function () {
        var next = button.dataset.setLang === "en" ? "en" : "hu";
        if (next === lang) return;
        lang = next;
        var db = loadDB();
        db.lang = lang;
        saveDB(db);
        applyLanguage();
      });
    });
  }

  function bindInterestForms() {
    document.querySelectorAll(".js-interest").forEach(function (form) {
      form.addEventListener("submit", onInterest);
      var reset = form.querySelector("[data-reset]");
      if (!reset) return;
      reset.addEventListener("click", function () {
        form.dataset.editing = "1";
        var input = form.querySelector('input[type="email"]');
        if (input && !input.value) input.value = loadDB().proEmail || "";
        refreshInterest();
        if (input) input.focus();
      });
    });
  }

  function bindApp() {
    ["addBtn", "emptyAdd"].forEach(function (id) {
      document.getElementById(id).addEventListener("click", onAddClick);
    });
    document.getElementById("proLink").addEventListener("click", openUpsell);
    document.getElementById("permBtn").addEventListener("click", onPerm);
    document.getElementById("subForm").addEventListener("submit", onSubmit);
    document.getElementById("formCancel").addEventListener("click", function () {
      document.getElementById("formDialog").close();
    });
    document.getElementById("formClose").addEventListener("click", function () {
      document.getElementById("formDialog").close();
    });
    document.getElementById("deleteCancel").addEventListener("click", function () {
      deleteId = null;
      document.getElementById("deleteDialog").close();
    });
    document.getElementById("deleteConfirm").addEventListener("click", confirmDelete);
    document.getElementById("upsellClose").addEventListener("click", function () {
      document.getElementById("upsellDialog").close();
    });
    document.querySelectorAll('#subForm input[name="cycle"]').forEach(function (radio) {
      radio.addEventListener("change", updateDateLabel);
    });
    document.querySelectorAll("[data-date-offset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var days = Number(button.getAttribute("data-date-offset"));
        var date = new Date();
        date.setDate(date.getDate() + days);
        document.getElementById("nextCharge").value = Logic.isoDate(date);
      });
    });
    ["formDialog", "deleteDialog", "upsellDialog"].forEach(function (id) {
      bindBackdrop(document.getElementById(id));
    });
    window.addEventListener("storage", function (event) {
      if (event.key === KEY) renderDynamic();
    });
  }

  function authMessage(code) {
    if (code === "invalid_email") return t("auth.invalidEmail");
    if (code === "password_too_short") return t("auth.passwordShort");
    if (code === "password_too_long") return t("auth.passwordLong");
    if (code === "email_taken") return t("auth.emailTaken");
    if (code === "invalid_credentials") return t("auth.invalidCredentials");
    if (code === "rate_limited") return t("auth.rateLimited");
    if (code === "unreachable") return t("auth.unreachable");
    return t("auth.failed");
  }

  function showAuthError(code) {
    var node = document.getElementById("authError");
    if (!node) return;
    node.hidden = false;
    node.dataset.code = code;
    node.textContent = authMessage(code);
    var passwordField = code === "password_too_short" || code === "password_too_long" || code === "invalid_credentials";
    var field = document.getElementById(passwordField ? "authPassword" : "authEmail");
    if (field) field.focus();
  }

  function renderAuthDialog() {
    var title = document.getElementById("authTitle");
    if (!title) return;
    var register = authMode === "register";
    title.textContent = t(register ? "auth.registerTitle" : "auth.loginTitle");
    var submit = document.getElementById("authSubmit");
    submit.textContent = t(authPending ? "auth.working" : register ? "auth.submitRegister" : "auth.submitLogin");
    submit.disabled = authPending;
    var switcher = document.getElementById("authSwitch");
    switcher.disabled = authPending;
    switcher.textContent = t(register ? "auth.switchToLogin" : "auth.switchToRegister");
    document.getElementById("authPassword").setAttribute("autocomplete", register ? "new-password" : "current-password");
    var err = document.getElementById("authError");
    if (err && !err.hidden && err.dataset.code) err.textContent = authMessage(err.dataset.code);
  }

  function renderAccount() {
    if (!Auth) return;
    var session = Auth.load();
    var open = document.getElementById("authOpen");
    var register = document.getElementById("registerOpen");
    var email = document.getElementById("accountEmail");
    var logout = document.getElementById("logoutBtn");
    if (!open || !email || !logout) return;
    var signedIn = !!(session && session.token && session.email);
    open.hidden = signedIn;
    if (register) register.hidden = signedIn;
    email.hidden = !signedIn;
    logout.hidden = !signedIn;
    if (signedIn) {
      email.textContent = session.email;
      email.title = session.email;
    } else {
      email.textContent = "";
      email.removeAttribute("title");
    }
  }

  function refreshAccount() {
    if (!Auth) return;
    var session = Auth.load();
    renderAccount();
    if (!session) return;
    var token = session.token;
    Auth.me(token).then(function (me) {
      var current = Auth.load();
      if (!current || current.token !== token || !me || !me.email) return;
      Auth.save({ token: token, email: me.email });
      renderAccount();
    }).catch(function (err) {
      var current = Auth.load();
      if (!current || current.token !== token) return;
      if (err && err.unreachable) showToast(t("auth.unreachable"));
      else Auth.clear();
      renderAccount();
    });
  }

  function openAuth(mode) {
    authMode = mode === "register" ? "register" : "login";
    var err = document.getElementById("authError");
    err.hidden = true;
    err.dataset.code = "";
    renderAuthDialog();
    var dialog = document.getElementById("authDialog");
    if (!dialog.open) dialog.showModal();
    document.getElementById("authEmail").focus();
  }

  function onAuthSubmit(event) {
    event.preventDefault();
    if (authPending || !Auth) return;
    var email = document.getElementById("authEmail").value.trim();
    var password = document.getElementById("authPassword").value;
    if (!Logic.isEmail(email)) {
      showAuthError("invalid_email");
      return;
    }
    if (password.length < 8) {
      showAuthError("password_too_short");
      return;
    }
    if (password.length > 200) {
      showAuthError("password_too_long");
      return;
    }
    authPending = true;
    renderAuthDialog();
    var action = authMode === "register" ? Auth.register : Auth.login;
    action(email, password).then(function (result) {
      Auth.save({ token: result.token, email: result.email });
      document.getElementById("authPassword").value = "";
      document.getElementById("authDialog").close();
      renderAccount();
      showToast(t(authMode === "register" ? "auth.registered" : "auth.loggedIn"));
    }).catch(function (err) {
      showAuthError(err && err.code ? err.code : "failed");
    }).then(function () {
      authPending = false;
      renderAuthDialog();
    });
  }

  function onLogout() {
    if (!Auth) return;
    var session = Auth.load();
    var button = document.getElementById("logoutBtn");
    if (!session) {
      renderAccount();
      return;
    }
    if (button) button.disabled = true;
    Auth.logout(session.token).then(function () {
      Auth.clear();
      showToast(t("auth.loggedOut"));
    }).catch(function (err) {
      if (err && err.unreachable) showToast(t("auth.unreachable"));
      else {
        Auth.clear();
        showToast(t("auth.loggedOut"));
      }
    }).then(function () {
      if (button) button.disabled = false;
      renderAccount();
    });
  }

  function bindAuth() {
    var open = document.getElementById("authOpen");
    var dialog = document.getElementById("authDialog");
    if (!open || !dialog) return;
    open.addEventListener("click", function () { openAuth("login"); });
    var register = document.getElementById("registerOpen");
    if (register) register.addEventListener("click", function () { openAuth("register"); });
    document.getElementById("authClose").addEventListener("click", function () { dialog.close(); });
    document.getElementById("authSwitch").addEventListener("click", function () {
      authMode = authMode === "register" ? "login" : "register";
      var err = document.getElementById("authError");
      err.hidden = true;
      err.dataset.code = "";
      renderAuthDialog();
    });
    document.getElementById("authForm").addEventListener("submit", onAuthSubmit);
    document.getElementById("logoutBtn").addEventListener("click", onLogout);
    bindBackdrop(dialog);
    dialog.addEventListener("close", function () {
      document.getElementById("authPassword").value = "";
      authPending = false;
    });
    window.addEventListener("storage", function (event) {
      if (Auth && event.key === Auth.STORAGE_KEY) renderAccount();
    });
  }

  function init() {
    var stored = loadDB().lang;
    lang = stored === "en" ? "en" : "hu";
    bindLang();
    bindInterestForms();
    bindAuth();
    if (document.body.dataset.page === "app") bindApp();
    applyLanguage();
    refreshAccount();
    if (document.body.dataset.page !== "app") return;
    checkReminders();
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") checkReminders();
    });
    setInterval(checkReminders, 60000);
    if (location.hash === "#pro") {
      openUpsell();
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  init();
})();
