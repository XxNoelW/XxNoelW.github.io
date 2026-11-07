# SubStop

Subscription tracker: list what you pay for, see the monthly total, and get a reminder before the next charge. Hungarian by default, with an English toggle. Plans, trials, and reminders stay in the browser (`localStorage`). There is no build step.

In this repository the site is served from the `substop/` folder:

https://xxnoelw.github.io/substop/

Asset links are relative, so the folder can move to its own repository and be served at the domain root.

## Move it to its own repository

1. Create a new empty GitHub repository.
2. Copy the **contents** of this folder into that repository’s root, so `index.html` sits next to `css/` and `js/` (not inside another `substop/` directory).
3. Commit and push.
4. In the new repository: Settings → Pages → Deploy from branch → `main` → `/ (root)`.

The empty `.nojekyll` file is included so GitHub Pages serves the files as-is when this folder is the site root.

Do **not** copy `CNAME` into the root of `XxNoelW.github.io`. GitHub Pages only reads a `CNAME` at the site root. A root `CNAME` here would point the whole existing site at `substop.net`. While this folder lives inside that repository, `substop/CNAME` is only a static file and does not change the domain.

## Custom domain `substop.net`

`CNAME` already contains:

```
substop.net
```

It takes effect after this folder is the root of its own GitHub Pages site. Add the custom domain in that repository’s Pages settings only if you control the DNS for `substop.net`.

At the DNS host, point the apex at GitHub Pages:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |

Optional `www`: `CNAME` `www` → `<user>.github.io.`

Then in the new repo: Settings → Pages → Custom domain → `substop.net`, and turn on Enforce HTTPS after the certificate is issued. Confirm the addresses in [GitHub’s Pages domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) if they ever change.

After the domain serves the site, update the absolute URLs in `index.html` and `app.html` (`canonical`, `og:url`, `og:image`, `twitter:image`, and the JSON-LD `url` on the home page) from `https://xxnoelw.github.io/substop/` to `https://substop.net/`.

## Local preview

Open `index.html` in a browser, or from this folder:

```bash
python3 -m http.server 8080
```

Browser notifications need a secure page (`https` or `http://localhost`). The on-page banner and the `.ics` download also work from a file URL. The `.ics` event sits on the charge date at 09:00, with an alarm one day before.

Logic checks (no browser):

```bash
node --test test/logic.test.js
```
