(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SubStopAuth = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var PROD_API = "https://substop-api.knoel99-morcik.workers.dev";
  var LOCAL_API = "http://127.0.0.1:8787";
  var STORAGE_KEY = "substop.auth.v1";

  function apiBase(hostname) {
    var host = hostname;
    if (!host && typeof location !== "undefined" && location.hostname) host = location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return LOCAL_API;
    return PROD_API;
  }

  function AuthError(code, unreachable) {
    this.code = code || "failed";
    this.unreachable = !!unreachable;
  }
  AuthError.prototype = Object.create(Error.prototype);
  AuthError.prototype.name = "AuthError";

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || typeof data.token !== "string" || typeof data.email !== "string") return null;
      if (!/^[A-Za-z0-9_-]{20,200}$/.test(data.token)) return null;
      if (!data.email) return null;
      return { token: data.token, email: data.email };
    } catch (err) {
      return null;
    }
  }

  function save(session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      token: session.token,
      email: session.email
    }));
  }

  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function request(method, path, body, token) {
    var headers = { Accept: "application/json" };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(apiBase() + path, {
      method: method,
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (response) {
      if (response.status === 204) return null;
      return response.json().catch(function () { return null; }).then(function (data) {
        if (!response.ok) {
          var code = data && typeof data.error === "string" ? data.error : "failed";
          throw new AuthError(code, false);
        }
        return data;
      });
    }).catch(function (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError("unreachable", true);
    });
  }

  function register(email, password) {
    return request("POST", "/api/register", { email: email, password: password }, null);
  }

  function login(email, password) {
    return request("POST", "/api/login", { email: email, password: password }, null);
  }

  function logout(token) {
    return request("POST", "/api/logout", null, token);
  }

  function me(token) {
    return request("GET", "/api/me", null, token);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    apiBase: apiBase,
    load: load,
    save: save,
    clear: clear,
    register: register,
    login: login,
    logout: logout,
    me: me
  };
});
