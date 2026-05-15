# Hardloopweer

A simple web app for runners who want to quickly check whether the weather is good for a run.

## What does it do?

At a glance you get:

- Current temperature, feels-like, wind, humidity and dew point
- Go/no-go advice based on dew point, feels-like temperature, UV index and wind force
- Clothing recommendations tailored to the conditions
- UV index with a day chart and real-time RIVM measurements (Netherlands)
- Temperature and precipitation (15-minute resolution) for the next 48 hours
- Rain radar via Buienradar (Netherlands only)
- Official weather warnings via MeteoAlarm (Europe) and NWS (US)
- City search with autocomplete, or use your current location

## Tech

Plain HTML/CSS/JS — no build tool, no framework.

| What | Source |
|---|---|
| Weather data & geocoding | [Open-Meteo](https://open-meteo.com) (free, no API key) |
| Reverse geocoding | [Nominatim](https://nominatim.org) (OpenStreetMap) |
| UV measurements (NL) | [RIVM Zonkrachtwijzer](https://www.rivm.nl/zonkracht) |
| Weather warnings Europe | [MeteoAlarm via MET.no](https://api.met.no) |
| Weather warnings US | [NWS](https://www.weather.gov/documentation/services-web-api) |
| Rain radar | [Buienradar](https://www.buienradar.nl) |
| Charts | [Chart.js](https://www.chartjs.org) |
| Weather icons | [Meteocons](https://github.com/basmilius/weather-icons) |

## Live

[hardloopweer.olaflemmers.nl](https://hardloopweer.olaflemmers.nl)

## License

MIT — see [LICENSE](LICENSE).
