# Beter Theme: modern, funky en smaakvol

## Doel

Maak een extra visueel theme voor Hardloopweer dat moderner, energieker en minder plat aanvoelt, zonder de eenvoud van de app kwijt te raken. Het huidige theme blijft bestaan en blijft de veilige default. Dit "Beter Theme" komt ernaast te staan als opt-in theme, zodat we meerdere themes naast elkaar kunnen ontwikkelen, testen en vergelijken.

De app blijft een snelle single-page check voor hardlopers: temperatuur, regen, wind, dauwpunt, zonkracht en kledingadvies moeten in een paar seconden scanbaar blijven.

Het nieuwe theme moet:

- naast het huidige theme kunnen bestaan;
- via een eenvoudige feature flag of code-instelling aan/uit te zetten zijn;
- geen publieke theme-switcher of frontend-bediening nodig hebben in deze fase;
- werken in light mode en dark mode;
- de bestaande pure HTML/CSS/JS stack respecteren;
- geen build-tool, framework of zware dependency introduceren;
- beter aanvoelen op mobiel;
- minder "platte witte kaarten op blauw" zijn;
- wel smaakvol blijven: sportief, fris, niet schreeuwerig;
- de huidige data en functionaliteit ongemoeid laten.

## Ontwerprichting

Ga voor een stijl die voelt als:

- een moderne running/weather companion;
- compact en praktisch, maar met meer karakter;
- energiek door kleur, diepte en motion;
- helder genoeg voor buitengebruik op een telefoon;
- serieus genoeg om weeradvies betrouwbaar te laten voelen.

Vermijd:

- een marketing-landingpage uitstraling;
- te veel gradient-orbs of decoratieve blobs;
- een compleet paarse/blauwe eenheidsworst;
- enorme hero-secties;
- nested cards;
- veel ronde pillen met tekst waar een normaal label, icon of compacte badge beter werkt.

## Technische aanpak

Splits theme en applicatiecode beter van elkaar. Het doel is niet om het bestaande `style.css` destructief te vervangen, maar om een theming-structuur te maken waarin het huidige theme en het Beter Theme naast elkaar kunnen bestaan.

Gebruik bij voorkeur deze structuur:

```text
hardloopweer/
├── index.html
├── script.js
├── style.css
└── themes/
    ├── default.css
    └── beter-theme.css
```

Aanpak:

- verplaats of kopieer de huidige visuele theme-regels naar `themes/default.css`;
- zet algemene layout/base-regels die voor alle themes gelden in `style.css`;
- zet alle specifieke Beter Theme tokens en component-styling in `themes/beter-theme.css`;
- laad precies één themebestand vanuit `index.html`, of laad beide en scope theme-regels via een attribuut op `html` of `body`;
- houd het huidige theme als default.

In deze fase hoeft er geen theme-changer UI te komen. Een simpele feature flag in code is genoeg.

Voorbeeld met één constante in `script.js`:

```js
const FEATURE_THEME = 'default'; // 'default' of 'beter'

document.documentElement.dataset.theme = FEATURE_THEME;
```

Of, als je liever geen JavaScript nodig hebt voor theming:

```html
<html lang="nl" data-theme="default">
```

Voor lokaal testen kan een andere AI tijdelijk `data-theme="beter"` zetten. Later kan daar eventueel een query parameter, localStorage of echte UI-toggle bij komen, maar dat hoort niet bij deze fase.

Belangrijk: themebestanden mogen alleen presentatie bepalen. Ze mogen geen weerlogica, API-keuzes, RIVM/Open-Meteo-logica of renderingdata veranderen.

Werk vooral in CSS. Pas `index.html` alleen aan als er echt extra wrapper-elementen, theme-links of labels nodig zijn. Laat `script.js` zoveel mogelijk met rust, behalve voor:

- het zetten van `data-theme`;
- het laden van het juiste themebestand;
- het uitlezen van CSS custom properties voor Chart.js-kleuren.

## Theme-architectuur

Maak onderscheid tussen drie lagen:

1. **Base/app CSS**
   - Bestand: `style.css`
   - Bevat reset, basislayout, toegankelijkheid, structurele component-layout, chart sizing, utility classes zoals `.hidden`.
   - Bevat zo min mogelijk kleur, schaduw en decoratieve styling.

2. **Default theme**
   - Bestand: `themes/default.css`
   - Bevat de huidige look-and-feel.
   - Moet de app er zo veel mogelijk laten uitzien zoals nu.
   - Dit blijft de default als er geen feature flag is gezet.

3. **Beter theme**
   - Bestand: `themes/beter-theme.css`
   - Bevat de nieuwe moderne/funky styling.
   - Scope alle regels onder `[data-theme="beter"]` als beide themebestanden tegelijk geladen worden.

Er zijn twee acceptabele implementatievormen.

### Optie A: een themebestand dynamisch laden

In `index.html`:

```html
<link rel="stylesheet" href="style.css">
<link id="theme-stylesheet" rel="stylesheet" href="themes/default.css">
```

In `script.js` vroeg in de startup:

```js
const FEATURE_THEME = 'default'; // verander naar 'beter' om het nieuwe theme te testen

function applyThemeFlag() {
  const theme = FEATURE_THEME === 'beter' ? 'beter' : 'default';
  document.documentElement.dataset.theme = theme;

  const themeLink = document.getElementById('theme-stylesheet');
  if (themeLink) {
    themeLink.href = theme === 'beter'
      ? 'themes/beter-theme.css'
      : 'themes/default.css';
  }
}

applyThemeFlag();
```

Voordeel: er wordt maar één theme geladen.

Nadeel: er is een heel klein moment waarop default CSS geladen kan zijn voordat JS de href wisselt, tenzij de flag direct inline in de head staat.

### Optie B: beide themes laden, scopen met `data-theme`

In `index.html`:

```html
<html lang="nl" data-theme="default">
```

```html
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="themes/default.css">
<link rel="stylesheet" href="themes/beter-theme.css">
```

In CSS:

```css
:root,
[data-theme="default"] {
  /* default theme tokens */
}

[data-theme="beter"] {
  /* beter theme tokens */
}

[data-theme="beter"] .card {
  /* beter card styling */
}
```

Voordeel: eenvoudig testen, geen stylesheet swapping.

Nadeel: alle theme-CSS wordt geladen, en selectors moeten zorgvuldig gescoped zijn.

Voor deze kleine app is optie B prima en het minst fragiel. Als performance later belangrijk wordt, kan optie A alsnog.

## CSS custom properties

Gebruik CSS custom properties als designsysteem. Zet de Beter Theme tokens niet globaal in `:root` zonder scope, anders overschrijf je het huidige theme. Scope ze onder `[data-theme="beter"]` of zet ze in `themes/beter-theme.css` terwijl dat bestand alleen wordt geladen als de feature flag actief is.

Voorbeeld voor `themes/beter-theme.css`:

```css
[data-theme="beter"] {
  color-scheme: light;

  --page-bg: #eaf4f1;
  --page-bg-2: #d9ecff;
  --surface: rgba(255, 255, 255, 0.82);
  --surface-strong: #ffffff;
  --surface-muted: rgba(255, 255, 255, 0.58);

  --text-primary: #17201f;
  --text-secondary: #5f6f6c;
  --text-inverse: #f7fbff;

  --accent: #006dff;
  --accent-2: #00a676;
  --accent-warm: #ffb000;
  --rain: #2678ff;
  --temp: #ff5c35;

  --success-color: #168a4a;
  --warning-color: #d89200;
  --danger-color: #d83b2d;

  --border-soft: rgba(23, 32, 31, 0.1);
  --border-strong: rgba(23, 32, 31, 0.18);

  --shadow-soft: 0 14px 40px rgba(24, 47, 66, 0.12);
  --shadow-card: 0 1px 0 rgba(255,255,255,0.75) inset, 0 18px 50px rgba(24, 47, 66, 0.14);
  --shadow-pressed: 0 8px 20px rgba(24, 47, 66, 0.12);

  --radius-sm: 10px;
  --radius-md: 16px;
  --radius-lg: 22px;

  --space-1: 6px;
  --space-2: 10px;
  --space-3: 14px;
  --space-4: 18px;
  --space-5: 24px;
  --space-6: 32px;
}
```

Voeg daarna dark mode toe met `prefers-color-scheme`, ook gescoped op het Beter Theme:

```css
@media (prefers-color-scheme: dark) {
  [data-theme="beter"] {
    color-scheme: dark;

    --page-bg: #071516;
    --page-bg-2: #10223a;
    --surface: rgba(16, 27, 31, 0.82);
    --surface-strong: #111d21;
    --surface-muted: rgba(255, 255, 255, 0.07);

    --text-primary: #eff8f5;
    --text-secondary: #a9bbb6;
    --text-inverse: #071516;

    --accent: #63a6ff;
    --accent-2: #33d39c;
    --accent-warm: #ffd166;
    --rain: #74aaff;
    --temp: #ff8a66;

    --success-color: #5fe09a;
    --warning-color: #ffd166;
    --danger-color: #ff7b6d;

    --border-soft: rgba(255, 255, 255, 0.1);
    --border-strong: rgba(255, 255, 255, 0.18);

    --shadow-soft: 0 18px 60px rgba(0, 0, 0, 0.28);
    --shadow-card: 0 1px 0 rgba(255,255,255,0.08) inset, 0 22px 70px rgba(0, 0, 0, 0.34);
    --shadow-pressed: 0 10px 24px rgba(0, 0, 0, 0.26);
  }
}
```

Gebruik geen handmatige dark-mode classes zolang er geen theme-toggle bestaat. `prefers-color-scheme` is genoeg voor deze fase. Dit staat los van de theme feature flag: `data-theme` kiest het visuele theme, `prefers-color-scheme` kiest de light/dark variant binnen dat theme.

## Body en achtergrond

Voor het Beter Theme: vervang de vlakke blauwe achtergrond door een subtiele, gelaagde achtergrond die in light mode fris voelt en in dark mode diepte geeft. Laat het default theme ongemoeid.

Voorstel:

```css
[data-theme="beter"] body {
  background:
    radial-gradient(circle at 18% -10%, color-mix(in srgb, var(--accent-warm) 28%, transparent), transparent 34rem),
    radial-gradient(circle at 105% 12%, color-mix(in srgb, var(--accent) 24%, transparent), transparent 30rem),
    linear-gradient(145deg, var(--page-bg), var(--page-bg-2));
  color: var(--text-primary);
}
```

Let op: gebruik gradients als zachte omgevingskleur, niet als losse decoratieve bollen. De achtergrond moet rustig blijven.

Maak `#app` iets ruimer en moderner:

- mobiel: max-width rond `520px`;
- desktop: max-width rond `1080px`;
- padding met `clamp()`;
- geen horizontale overflow.

## Card-systeem

De huidige cards zijn heel wit, rond en plat. Maak ze meer tactile:

```css
.card,
[data-theme="beter"] header {
  background: var(--surface);
  border: 1px solid var(--border-soft);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-radius: var(--radius-lg);
}
```

Gebruik `backdrop-filter` als progressive enhancement. De app moet ook zonder blur goed leesbaar zijn.

Belangrijk:

- houd cards maximaal 8 tot 24px radius; niet alles als pill maken;
- gebruik cards alleen voor echte modules;
- geen cards in cards;
- voeg subtiele top-border of inset highlight toe voor diepte;
- maak de padding iets compacter op mobiel en luchtiger op desktop.

## Header

De header mag meer app-achtig worden:

- logo links;
- titel compact;
- zoekknop als icon button;
- zoekveld als zachte inputbar;
- geen zwaar zwevende witte doos meer.

Aanpassingen:

- geef `.logo` een subtiele ring/border;
- maak `h1` iets strakker: font-weight `700`, letter-spacing `0`;
- zoekveld achtergrond `var(--surface-muted)`;
- focus states duidelijk met `outline` of `box-shadow`, niet alleen kleur.

Voor focus:

```css
:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--accent) 45%, transparent);
  outline-offset: 3px;
}
```

## Weather hero

Dit is het belangrijkste schermdeel. Maak het meer premium en scanbaar.

Voorstel:

- geef `#weather-hero` een eigen subtiele gradient-layer;
- plaats temperatuur groot en duidelijk;
- behoud de weather icon;
- zet locatie/tijd links of naast temperatuur afhankelijk van containerbreedte;
- maak metrics een echte responsive grid in plaats van geforceerde flexrij.

Gebruik container queries in plaats van veel viewport-breakpoints:

```css
#weather-hero {
  container-type: inline-size;
}

.weather-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: var(--space-2);
}

.metric-item {
  background: var(--surface-muted);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

@container (max-width: 380px) {
  .hero-content {
    align-items: stretch;
  }

  .weather-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

Maak de temperatuur expressiever:

```css
#current-temp {
  font-size: clamp(3rem, 18cqi, 5.8rem);
  font-weight: 800;
  line-height: 0.9;
}
```

Gebruik `cqi` alleen binnen container-query context. Als browser support een zorg is, voeg een normale fallback erboven toe.

## Running recommendation

Deze kaart moet voelen als het besluitcentrum: kan ik gaan lopen of niet?

Aanpassingen:

- badge minder Material, meer sportief;
- statuskleur als linkerrand of top accent;
- kledinglijst als compacte chips of nette checklist;
- waarschuwingen duidelijk, maar niet lomp rood tenzij echt gevaar.

Voorstel:

```css
.badge {
  border-radius: var(--radius-md);
  box-shadow: none;
  border: 1px solid currentColor;
  background: color-mix(in srgb, currentColor 12%, transparent);
}

.clothing-list {
  display: grid;
  gap: 8px;
}

.clothing-list li {
  background: var(--surface-muted);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
```

Vervang de bullet `·` eventueel door een Lucide icon als dat semantisch helpt, maar forceer geen iconen waar tekst sneller scant.

## UV/Zonkrachtkaart

Zonkracht mag visueel wat meer energie krijgen, zeker nu RIVM-data belangrijk is.

Aanpassingen:

- maak `uv-current` groot en prominent;
- toon `uv-max` als secundair datapunt als het element in HTML bestaat;
- geef de chart-container een subtiele plot-background;
- chartlijnen moeten kleuren uit CSS tokens gebruiken;
- dark mode chart-grid moet zichtbaar maar zacht zijn.

Als Chart.js kleuren nu hardcoded in `script.js` staan, maak een kleine helper:

```js
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
```

Gebruik die voor chart-kleuren waar mogelijk:

- temperatuur: `--temp`;
- regen: `--rain`;
- accent: `--accent`;
- tekst/grid afgeleid van CSS.

Voor de UV-zones:

- groen/geel/oranje/rood blijven functioneel;
- stem tinten af op light/dark mode;
- zorg dat geel in dark mode leesbaar blijft.

## Forecast charts

De grafiekkaarten voelen nu technisch en vlak. Maak ze rustiger:

- legend als compacte inline labels;
- chart container met lichte binnenachtergrond;
- horizontale scroll duidelijker op mobiel;
- geen harde clipping;
- in dark mode gridlijnen en labels aanpassen.

CSS-idee:

```css
.chart-container,
.uv-chart-container {
  background: var(--surface-muted);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-md);
  padding: 8px;
}
```

Let op: Chart.js canvas sizing kan gevoelig zijn. Controleer na padding of `maintainAspectRatio: false` nog goed werkt.

## Regenradar

De Buienradar iframe is groot en praktisch. Maak de container beter geïntegreerd:

- behoud vaste hoogte;
- geef iframe-container dezelfde border en radius als chartcontainers;
- vermijd extra card-in-card gevoel: de radar zelf mag de framed tool zijn.

## Footer en taalkeuze

Maak de footer minder “witte tekst op blauwe site” en meer onderdeel van het theme:

- taalkeuze als compacte select;
- footerlinks subtiel;
- in dark mode iets lichter contrast;
- geen visuele dominantie.

## Responsive strategie

Gebruik een combinatie van:

- `clamp()` voor spacing en font sizes;
- CSS Grid met `auto-fit/minmax`;
- container queries voor componenten;
- maximaal 1 of 2 globale media queries voor de brede desktoplayout.

Vermijd het verzinnen van veel device breakpoints. Richt je op componentgedrag:

- hero moet omslaan als de card te smal is;
- metrics moeten van 4 naar 2 kolommen kunnen;
- charts moeten horizontaal scrollen als nodig;
- header moet compact blijven zonder tekstoverlap.

De bestaande desktoplayout gebruikt `columns: 2`. Overweeg om dit te vervangen door CSS Grid, want CSS columns kunnen kaarten op onverwachte volgorde zetten en zijn minder voorspelbaar voor dashboardachtige UI.

Voorkeur:

```css
@media (min-width: 900px) {
  main {
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
    gap: 20px;
    align-items: start;
  }

  main > * {
    margin-bottom: 0;
  }

  #alerts-section {
    grid-column: 1 / -1;
  }
}
```

Als de volgorde belangrijk is, gebruik geen CSS columns meer.

## Motion en interactie

Voeg subtiele interactie toe:

- cards krijgen geen overdreven hover op mobiel;
- buttons hebben korte `transform` of background transition;
- search suggestions voelen snappy;
- respecteer reduced motion.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Toegankelijkheid

Controleer:

- contrast in light en dark mode;
- focus states op zoekveld, knoppen, select en links;
- tekst mag niet overlappen;
- badges mogen niet alleen op kleur vertrouwen;
- grafiekdata moet via labels/tooltips begrijpelijk blijven;
- body tekst minimaal rond 14-16px;
- select en icon buttons minimaal 40x40px touch target.

## Bestanden die waarschijnlijk aangepast worden

### `style.css`

Basebestand voor gedeelde structuur. Niet langer alles-in-een voor themes.

Aanpassen:

- verplaats zo veel mogelijk theme-specifieke kleur/schaduw/radiusregels naar themebestanden;
- behoud reset, basislayout, chart sizing, `.hidden`, accessibility helpers en structurele responsive regels;
- vermijd dat `style.css` het Beter Theme hard overschrijft;
- als regels thematisch zijn, verplaats ze naar `themes/default.css` of `themes/beter-theme.css`.

### `themes/default.css`

Nieuw bestand.

Doel:

- bevat de huidige visuele stijl;
- houdt bestaande kleuren, shadows, radius en componentlook zoveel mogelijk intact;
- is de fallback/default.

Belangrijk:

- de app moet er met `data-theme="default"` vrijwel hetzelfde uitzien als nu;
- dit bestand is bedoeld als stabiele basis, niet als plek voor Beter Theme-experimenten.

### `themes/beter-theme.css`

Nieuw bestand.

Doel:

- bevat alle Beter Theme tokens;
- bevat light/dark varianten;
- bevat componentstyling voor header, cards, hero, badges, charts, footer;
- scoped regels onder `[data-theme="beter"]` als beide themebestanden tegelijk geladen worden.

Aanpassen/implementeren:

- tokenlaag voor Beter Theme;
- dark mode via `@media (prefers-color-scheme: dark)`;
- body background;
- cards/header;
- hero;
- metrics;
- recommendation/badges;
- UV/chart containers;
- footer;
- eventueel desktoplayout als die visueel theme-gebonden is.

### `index.html`

Aanpassen voor theme-laden.

Mogelijke wijzigingen:

- voeg `data-theme="default"` toe aan `<html>` of `<body>`;
- voeg links naar theme CSS toe;
- voeg eventueel `<link id="theme-stylesheet">` toe als dynamisch laden wordt gekozen;
- extra wrapper rond hero-statistieken als container queries beter werken;
- zichtbaar `uv-max` element toevoegen als `script.js` dit al verwacht;
- duidelijke chart legends voor “Max. verwacht” en “Gemeten”;
- eventueel `aria-label`s op icon buttons verbeteren.

### `script.js`

Zo min mogelijk aanpassen.

Alleen nodig als:

- er een feature flag komt zoals `const FEATURE_THEME = 'default'`;
- `data-theme` gezet moet worden;
- een theme stylesheet dynamisch gekozen moet worden;
- Chart.js kleuren moeten meebewegen met dark mode;
- chart-grid/tick-kleuren via CSS variables ingesteld moeten worden;
- er een theme-change redraw nodig is wanneer dark mode wijzigt.

Belangrijk: geen theme-switcher UI bouwen. De flag mag hardcoded zijn.

Voor dark mode redraw:

```js
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (state.lastWeatherData) updateUI(state.lastWeatherData);
});
```

Doe dit alleen als chartkleuren anders niet automatisch goed updaten.

## Implementatievolgorde

1. Maak een `themes/` map.
2. Split de bestaande CSS voorzichtig:
   - gedeelde structurele regels blijven in `style.css`;
   - huidige visuele styling gaat naar `themes/default.css`.
3. Voeg `data-theme="default"` toe en controleer dat de app er nog hetzelfde uitziet.
4. Voeg `themes/beter-theme.css` toe.
5. Maak een simpele feature flag:
   - hardcoded `data-theme="beter"` in HTML, of
   - `const FEATURE_THEME = 'beter'` in `script.js`.
6. Bouw de Beter Theme tokenlaag en dark-mode tokens.
7. Style body, cards en header voor Beter Theme.
8. Refactor de hero en metrics naar grid/container queries waar nodig.
9. Style recommendation, badges en kledinglijst.
10. Style UV en chartcontainers.
11. Vervang desktop `columns` door CSS Grid als dat visueel beter werkt en niet theme-specifiek conflicteert.
12. Werk footer en taalkeuze bij.
13. Pas Chart.js kleuren aan indien nodig via CSS variables.
14. Test default theme: mag niet regressief veranderen.
15. Test Beter Theme light mode.
16. Test Beter Theme dark mode.
17. Test mobiel op 320px, 375px, 390px, 430px.
18. Test desktop rond 900px, 1024px en 1440px.

## Acceptatiecriteria

De wijziging is klaar als:

- het huidige/default theme nog werkt en visueel niet onbedoeld veranderd is;
- Beter Theme naast default kan bestaan;
- het gekozen theme via een simpele feature flag/code-instelling te wisselen is;
- er geen publieke theme-switcher UI is toegevoegd;
- de app in light mode modern, fris en minder plat oogt;
- de app in dark mode volledig bruikbaar en stijlvol is;
- alle cards, inputs, badges en charts thematisch consistent zijn;
- er geen tekstoverlap is op kleine schermen;
- de weather hero direct scanbaar blijft;
- de chartlabels en grafieken leesbaar blijven;
- er geen framework of build-step is toegevoegd;
- de bestaande datafunctionaliteit niet is veranderd;
- de app op mobiel duidelijk beter aanvoelt dan het huidige ontwerp.

## Smaakrichting in een zin

Maak Hardloopweer meer als een compacte, premium running cockpit: fris, tastbaar, sportief en een beetje funky, maar nog steeds rustig genoeg om vlak voor je run snel te vertrouwen.
