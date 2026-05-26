# Hardloopweer

Een simpele single-page web-app waarmee hardlopers snel kunnen checken of het goed weer is om te gaan rennen. Live op **https://hardloopweer.olaflemmers.nl**

## Doel

Snelle visuele check: temperatuur, regen, luchtvochtigheid, UV-index, windkracht, dauwpunt. Met kledingadvies en een go/no-go oordeel.

## Stack

- Puur HTML/CSS/JS — geen build-tool, geen framework
- **Open-Meteo API** (gratis, geen API key): weer + geocoding; **MET Norway** als fallback
- **Nominatim** (OpenStreetMap): reverse geocoding bij GPS-locatie
- **Chart.js** / **ApexCharts** (CDN): grafieken
- **Lucide** (CDN): iconen
- **Inter** (Google Fonts): lettertype
- **Vercel**: hosting + serverless functions in `api/`

## Bestandsstructuur

```
hardloopweer/
├── index.html        # Alle UI-elementen
├── script.js         # Alle logica (state, API-calls, rendering)
├── style.css         # Alle styling
├── logo.png          # App-logo in header
├── favicon.png       # Favicon
├── build.sh          # Rudimentair build-script (versienummer)
├── vercel.json       # SPA-rewrites + /api/* uitsluiting
└── api/
    └── dwd.js        # Vercel proxy voor DWD weerbericht (CORS omzeiling)
```

## Hoe werkt het

1. Bij laden: GPS-locatie ophalen (of default Amsterdam), of locatie uit URL-pad
2. Open-Meteo aanroepen voor huidige weer + 48u voorspelling; MET Norway als fallback
3. UI updaten: temperatuur, vochtigheid, windkracht, dauwpunt, UV, AQI
4. Comfortlevel berekenen op basis van dauwpunt + temperatuur (Fahrenheit-som methode)
5. Kledingadvies + go/no-go badge genereren

## URL-routing

Locaties zijn bereikbaar via `/{landslug}/{stadslug}`, bijv. `/nederland/amsterdam` of `/verenigde-staten/new-york`. 80+ landen worden ondersteund met Nederlandse slugs. Onbekende landen vallen terug op `?city=...&lat=...&lon=...`.

## Locatiespecifieke secties

- **Nederland**: Buienradar-widget, KNMI-weerbericht
- **Duitsland**: RainViewer-radarkaart, DWD-weerbericht (via `api/dwd.js`), UBA-luchtkwaliteit
- **Overig**: RainViewer-radarkaart, Open-Meteo AQI

## Weer-API fallback

Open-Meteo primair → MET Norway (`api.met.no`) als fallback bij storing. MET Norway vereist `User-Agent` header. Tijdzone wordt opgehaald uit geocoding-response en bevestigd door de weer-API.

## API-parameters (Open-Meteo)

**Current:** `temperature_2m`, `relative_humidity_2m`, `apparent_temperature`, `is_day`, `weather_code`, `wind_speed_10m`, `wind_direction_10m`

**Hourly:** `temperature_2m`, `weather_code`, `dew_point_2m`, `precipitation`, `uv_index`, `wind_speed_10m`, `wind_gusts_10m`

## Nog te doen

- [ ] Weercode-tabel uitbreiden (mist codes 48, 53, 55, 56, 57, 63, 65, 66, 67, 73, 75, 77, 80–82, 85, 86, 96, 99)
- [ ] "Stockfoto"-sectie hernoemen — toont Unsplash-stockfoto's, geen echte webcams
- [ ] Widget drag-to-reorder: widgets kunnen van plek wisselen zodat kortere widgets automatisch omhoog schuiven in de tweede kolom
- [ ] DWD regio-matching verbeteren — huidige bounding-box-match per regio is niet nauwkeurig; locaties vlak bij een grens of buiten de vaste kaders krijgen mogelijk het verkeerde weerbericht

## Comfortlevel-formule

Gebruikt de "temperatuursom"-methode: `(°F lucht) + (°F dauwpunt)`. Hoe hoger de som, hoe klammer het aanvoelt. Ranges: ≤100 perfect, ≤110 prima, ≤120 klammig, ≤130 warm, ≤140 plakkerig, ≤150 pittig, ≤160 zwaar, ≤170 afzien, ≤180 extreem, >180 stoppen.
