# Hardloopweer

Een simpele single-page web-app waarmee hardlopers snel kunnen checken of het goed weer is om te gaan rennen.

## Doel

Snelle visuele check: temperatuur, regen, luchtvochtigheid, UV-index, windkracht, dauwpunt. Met kledingadvies en een go/no-go oordeel.

## Stack

- Puur HTML/CSS/JS — geen build-tool, geen framework
- **Open-Meteo API** (gratis, geen API key): weer + geocoding
- **Nominatim** (OpenStreetMap): reverse geocoding bij GPS-locatie
- **Chart.js** (CDN): temperatuur/regen-grafiek
- **Lucide** (CDN): iconen
- **Inter** (Google Fonts): lettertype

## Bestandsstructuur

```
hardloopweer/
├── index.html      # Alle UI-elementen
├── script.js       # Alle logica (state, API-calls, rendering)
├── style.css       # Alle styling
├── logo.png        # App-logo in header
├── favicon.png     # Favicon
└── build.sh        # Rudimentair build-script (versienummer)
```

## Hoe werkt het

1. Bij laden: GPS-locatie ophalen (of default Amsterdam)
2. Open-Meteo aanroepen voor huidige weer + 48u voorspelling
3. UI updaten: temperatuur, vochtigheid, windkracht, dauwpunt
4. Comfortlevel berekenen op basis van dauwpunt + temperatuur (Fahrenheit-som methode)
5. Kledingadvies + go/no-go badge genereren

## API-parameters (Open-Meteo)

**Current:** `temperature_2m`, `relative_humidity_2m`, `apparent_temperature`, `is_day`, `weather_code`, `wind_speed_10m`, `wind_direction_10m`

**Hourly:** `temperature_2m`, `weather_code`, `dew_point_2m`, `precipitation`

**Nog toe te voegen:** `uv_index` (hourly), `precipitation_probability` (hourly)

## Nog te doen

- [ ] UV-index ophalen en tonen
- [ ] Weercode-tabel uitbreiden (nu mist codes 48, 53, 55, 56, 57, 63, 65, 66, 67, 73, 75, 77, 80–82, 85, 86, 96, 99)
- [ ] "Webcam"-sectie hernoemen — toont nu Unsplash-stockfoto's, geen echte webcams

## Comfortlevel-formule

Gebruikt de "temperatuursom"-methode: `(°F lucht) + (°F dauwpunt)`. Hoe hoger de som, hoe klammer het aanvoelt. Ranges: ≤100 perfect, ≤110 prima, ≤120 klammig, ≤130 warm, ≤140 plakkerig, ≤150 pittig, ≤160 zwaar, ≤170 afzien, ≤180 extreem, >180 stoppen.
