import { defineConfig } from "vitepress";

// VitePress treats `site/` as the docs root. `sync.mjs` copies the repo
// README into `site/index.md` and mirrors `docs/screenshots/` into
// `site/public/docs/screenshots/` before each build/dev run, so the same
// relative image paths resolve identically on GitHub and the published site.
export default defineConfig({
  title: "Overtide",
  description:
    "Osobisty tracker nadgodzin dla Redmine — wyrobione vs odebrane godziny z dopasowaniem FIFO.",
  lang: "pl-PL",
  cleanUrls: true,
  appearance: "dark",
  lastUpdated: false,
  themeConfig: {
    logo: undefined,
    siteTitle: "Overtide",
    nav: [
      {
        text: "GitHub",
        link: "https://github.com/oskar-bialek-bakk/overtide",
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/oskar-bialek-bakk/overtide" },
    ],
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "Szukaj", buttonAriaLabel: "Szukaj" },
              modal: {
                noResultsText: "Brak wyników dla",
                resetButtonTitle: "Wyczyść",
                footer: { selectText: "wybierz", navigateText: "nawiguj", closeText: "zamknij" },
              },
            },
          },
        },
      },
    },
  },
  head: [
    ["meta", { name: "color-scheme", content: "dark light" }],
    ["meta", { property: "og:title", content: "Overtide" }],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Osobisty tracker nadgodzin dla Redmine — wyrobione vs odebrane godziny z dopasowaniem FIFO.",
      },
    ],
  ],
});
