# Hardloopweer

Een simpele web-app voor hardlopers die snel willen checken of het goed weer is om te gaan rennen.

## Wat doet het?

Je ziet in één oogopslag:

- Huidige temperatuur, gevoelstemperatuur, wind, luchtvochtigheid en dauwpunt
- Go/no-go advies op basis van dauwpunt, gevoelstemperatuur, UV en windkracht
- Kledingadvies afgestemd op de omstandigheden
- Zonkracht (UV-index) met een dag-grafiek en RIVM meetwaarden voor Nederland
- Temperatuur en neerslag (15-minuten resolutie) voor de komende 48 uur
- Regenradar via Buienradar (alleen Nederland)
- Officiële weerwaarschuwingen via MeteoAlarm (Europa) en NWS (VS)
- Zoeken op stad met autocomplete, of gebruik je huidige locatie

## Technisch

Pure HTML/CSS/JS — geen build-tool, geen framework.

| Wat | Bron |
|---|---|
| Weerdata & geocoding | [Open-Meteo](https://open-meteo.com) (gratis, geen API key) |
| Reverse geocoding | [Nominatim](https://nominatim.org) (OpenStreetMap) |
| UV meetwaarden Nederland | [RIVM Zonkrachtwijzer](https://www.rivm.nl/zonkracht) |
| Weerwaarschuwingen Europa | [MeteoAlarm via MET.no](https://api.met.no) |
| Weerwaarschuwingen VS | [NWS](https://www.weather.gov/documentation/services-web-api) |
| Regenradar | [Buienradar](https://www.buienradar.nl) |
| Grafieken | [Chart.js](https://www.chartjs.org) |
| Weericons | [Meteocons](https://github.com/basmilius/weather-icons) |

## Live

[hardloopweer.olaflemmers.nl](https://hardloopweer.olaflemmers.nl)

## Licentie

MIT — zie [LICENSE](LICENSE).
