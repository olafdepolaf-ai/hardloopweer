const FEATURE_THEME = 'beter'; // 'default' of 'beter'
document.documentElement.dataset.theme = FEATURE_THEME;

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function detectLanguage() {
    const supported = Object.keys(STRINGS);
    const saved = localStorage.getItem('hw_lang');
    if (saved && supported.includes(saved)) return saved;
    const browser = (navigator.language || 'nl').split('-')[0].toLowerCase();
    return supported.includes(browser) ? browser : 'nl';
}

function t(key, params = {}) {
    const lang = state?.lang || 'nl';
    const s = STRINGS[lang]?.[key] ?? STRINGS['nl']?.[key] ?? key;
    return typeof s === 'string'
        ? s.replace(/{(\w+)}/g, (_, k) => String(params[k] ?? ''))
        : key;
}

function applyTranslations() {
    document.documentElement.lang = state.lang;
    document.title = t('page_title');
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', t('page_desc'));
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });
    const langSelect = document.getElementById('lang-select');
    if (langSelect) langSelect.value = state.lang;
}

const DEBUG = true;

const CONFIG = {
    API_URL: 'https://api.open-meteo.com/v1/forecast',
    GEO_API_URL: 'https://geocoding-api.open-meteo.com/v1/search',
    DEFAULT_CITY: 'Amsterdam',
    DEFAULT_LAT: 52.3676,
    DEFAULT_LON: 4.9041
};

const els = {
    citySearch: document.getElementById('city-search'),
    locationBtn: document.getElementById('location-btn'),
    cityName: document.getElementById('city-name'),
    currentTime: document.getElementById('current-time'),
    currentTemp: document.getElementById('current-temp'),
    weatherDesc: document.getElementById('weather-description'),
    feelsLike: document.getElementById('feels-like'),
    windForce: document.getElementById('wind-force'),
    windArrow: document.getElementById('wind-arrow'),
    humidity: document.getElementById('humidity'),
    dewPoint: document.getElementById('dew-point'),
    recommendationBadge: document.getElementById('recommendation-badge'),
    clothingTip: document.getElementById('clothing-tip'),
    warnings: document.getElementById('weather-warnings'),
    weatherIcon: document.getElementById('weather-icon'),
    comfortContainer: document.getElementById('comfort-container'),
    comfortLevel: document.getElementById('comfort-level'),
    buienradarFrame: document.getElementById('buienradar-frame'),
    searchContainer: document.getElementById('search-container'),
    searchToggle: document.getElementById('search-toggle'),
    searchSuggestions: document.getElementById('search-suggestions')
};

let state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    city: CONFIG.DEFAULT_CITY,
    tempChart: null,
    rainChart: null,
    uvChart: null,
    utcOffsetSeconds: 3600,
    timezone: 'Europe/Amsterdam',
    lang: detectLanguage(),
    _debug: {
        geoSource: 'default',
        uvSource: 'open-meteo',
        rdX: null, rdY: null, wmsI: null, wmsJ: null,
        rivmStatus: '–',
        temp: null, feelsLike: null, wind: null, humidity: null, dewPoint: null,
        uvCurrent: null, uvMax: null, weatherCode: null
    }
};

// Current hour at the searched location (not device local time)
function locationHour() {
    return Math.floor((Date.now() / 1000 + state.utcOffsetSeconds) / 3600) % 24;
}

function locationMinute() {
    return Math.floor((Date.now() / 1000 + state.utcOffsetSeconds) / 60) % 60;
}

// Local ISO timestamp at searched location, for comparing with API hourly.time strings
function locationISO() {
    return new Date(Date.now() + state.utcOffsetSeconds * 1000).toISOString().replace('Z', '');
}

function isInNetherlands() {
    return state.lat >= 50.5 && state.lat <= 53.7 && state.lon >= 3.3 && state.lon <= 7.3;
}

// ---- Weather alerts ----

const ALERT_ICONS = {
    1: '💨', 2: '🌨️', 3: '⛈️', 4: '🌫️', 5: '🌡️',
    6: '🥶', 7: '🌊', 8: '🔥', 9: '⛷️', 10: '🌧️', 11: '☀️', 12: '⚠️'
};

const ALERT_LOCALE = { nl: 'nl-NL', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES' };

function formatAlertTime(isoStr) {
    try {
        return new Date(isoStr).toLocaleString(ALERT_LOCALE[state.lang] || 'nl-NL', {
            weekday: 'short', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit',
            timeZone: state.timezone
        });
    } catch { return isoStr; }
}

async function fetchWeatherAlerts() {
    // MeteoAlarm via MET.no (covers most of Europe)
    try {
        const res = await fetch(
            `https://api.met.no/weatherapi/metalerts/2.0/current.json?lat=${state.lat}&lon=${state.lon}`
        );
        if (res.ok) {
            const data = await res.json();
            if (data.features?.length > 0) {
                return data.features.map(f => {
                    const p = f.properties;
                    const color = (p.riskMatrixColor || 'Yellow').toLowerCase();
                    const typeCode = parseInt((p.awareness_type || '12').split(';')[0].trim(), 10);
                    return {
                        color: ['yellow', 'orange', 'red'].includes(color) ? color : 'yellow',
                        typeCode: isNaN(typeCode) ? 12 : typeCode,
                        title: p.title || p.eventAwarenessName || p.event || '',
                        description: (p.description || '').trim(),
                        expires: p.expires
                    };
                });
            }
            return [];
        }
    } catch { /* not in MeteoAlarm coverage or CORS blocked */ }

    // NWS for US locations
    if (state.lat >= 24 && state.lat <= 50 && state.lon >= -125 && state.lon <= -66) {
        try {
            const res = await fetch(
                `https://api.weather.gov/alerts/active?point=${state.lat.toFixed(4)},${state.lon.toFixed(4)}`
            );
            if (res.ok) {
                const data = await res.json();
                return (data.features || []).map(f => {
                    const p = f.properties;
                    const sev = p.severity;
                    const color = sev === 'Extreme' ? 'red' : sev === 'Severe' ? 'orange' : 'yellow';
                    return {
                        color, typeCode: 12,
                        title: p.event || '',
                        description: (p.description || '').trim(),
                        expires: p.expires
                    };
                });
            }
        } catch { /* NWS unavailable */ }
    }

    return [];
}

function renderAlerts(alerts) {
    const section = document.getElementById('alerts-section');
    const container = document.getElementById('alerts-container');
    if (!section || !container) return;

    if (!alerts?.length) {
        section.classList.add('hidden');
        return;
    }

    const colorOrder = { red: 0, orange: 1, yellow: 2 };
    const sorted = [...alerts].sort((a, b) => (colorOrder[a.color] ?? 3) - (colorOrder[b.color] ?? 3));

    container.innerHTML = sorted.map((a, i) => {
        const icon = ALERT_ICONS[a.typeCode] || '⚠️';
        const expStr = a.expires ? formatAlertTime(a.expires) : '';
        return `${i > 0 ? '<hr class="alert-divider">' : ''}
        <div class="alert-item alert-${a.color}">
            <div class="alert-header">
                <span class="alert-icon">${icon}</span>
                <strong>${escHtml(a.title)}</strong>
            </div>
            ${expStr ? `<p class="alert-expires">${t('alert_expires', { time: expStr })}</p>` : ''}
            ${a.description ? `<p class="alert-desc">${escHtml(a.description)}</p>` : ''}
        </div>`;
    }).join('');

    section.className = 'card';
    section.classList.remove('hidden');
}

function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

function countryFlag(code) {
    if (!code) return '';
    return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
}

async function fetchSuggestions(query) {
    if (!query || query.length < 2) return [];
    try {
        const res = await fetch(`${CONFIG.GEO_API_URL}?name=${encodeURIComponent(query)}&count=6&language=${state.lang}&format=json`);
        const data = await res.json();
        return data.results || [];
    } catch {
        return [];
    }
}

let activeSuggestionIdx = -1;

function showSuggestions(results) {
    const ul = els.searchSuggestions;
    if (!ul || results.length === 0) { hideSuggestions(); return; }
    ul.innerHTML = results.map((r, i) => {
        const flag = countryFlag(r.country_code);
        const detail = [r.admin1, r.country].filter(Boolean).join(', ');
        return `<li class="search-suggestion-item" data-idx="${i}" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${escAttr(r.name)}">
            <span class="suggestion-name">${flag} ${escHtml(r.name)}</span>
            <span class="suggestion-detail">${escHtml(detail)}</span>
        </li>`;
    }).join('');
    ul.classList.remove('hidden');
    activeSuggestionIdx = -1;
    ul.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.addEventListener('mousedown', (e) => { e.preventDefault(); selectSuggestion(item); });
    });
}

function hideSuggestions() {
    els.searchSuggestions?.classList.add('hidden');
    activeSuggestionIdx = -1;
}

function selectSuggestion(item) {
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.dataset.name;
    state.lat = lat;
    state.lon = lon;
    state.city = name;
    els.cityName.innerText = name;
    els.citySearch.value = name;
    hideSuggestions();
    fetchWeather();
    updateBuienradar();
    if (!els.searchToggle?.classList.contains('hidden')) {
        els.searchContainer.classList.add('collapsed');
        els.searchToggle.classList.remove('active');
    }
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) {
    return String(s).replace(/"/g, '&quot;');
}

function onLocationGranted() {
    els.searchContainer?.classList.add('collapsed');
    els.searchToggle?.classList.remove('hidden');
    if (window.lucide) lucide.createIcons();
}

async function init() {
    applyTranslations();
    updateTime();
    setInterval(updateTime, 10000);
    updateBuienradar();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (state._lastHourly) {
            renderChart(state._lastHourly, state._lastMinutely15);
            renderUVChart(state._lastHourly, state._lastDaily);
        }
    });

    document.getElementById('lang-select')?.addEventListener('change', (e) => {
        state.lang = e.target.value;
        localStorage.setItem('hw_lang', state.lang);
        applyTranslations();
        if (state.uvChart) {
            state.uvChart.data.datasets[0].label = t('uv_label_predicted');
            state.uvChart.data.datasets[1].label = t('uv_label_measured');
            state.uvChart.update();
        }
    });

    if (DEBUG) renderDebug();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                state.lat = pos.coords.latitude;
                state.lon = pos.coords.longitude;
                if (DEBUG) { state._debug.geoSource = 'GPS ✓'; renderDebug(); }
                fetchWeather();
                updateBuienradar();
                reverseGeocode(state.lat, state.lon);
                onLocationGranted();
            },
            () => {
                if (DEBUG) { state._debug.geoSource = 'default (geen toestemming)'; renderDebug(); }
                fetchWeather();
            }
        );
    } else {
        if (DEBUG) { state._debug.geoSource = 'default (geen geo-API)'; renderDebug(); }
        fetchWeather();
    }

    const debouncedSuggest = debounce(async (query) => {
        const results = await fetchSuggestions(query);
        showSuggestions(results);
    }, 280);

    els.citySearch.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (q.length < 2) { hideSuggestions(); return; }
        debouncedSuggest(q);
    });

    els.citySearch.addEventListener('keydown', (e) => {
        const items = els.searchSuggestions?.querySelectorAll('.search-suggestion-item');
        if (e.key === 'ArrowDown') {
            if (!items?.length) return;
            e.preventDefault();
            activeSuggestionIdx = Math.min(activeSuggestionIdx + 1, items.length - 1);
            items.forEach((el, i) => el.classList.toggle('active', i === activeSuggestionIdx));
        } else if (e.key === 'ArrowUp') {
            if (!items?.length) return;
            e.preventDefault();
            activeSuggestionIdx = Math.max(activeSuggestionIdx - 1, 0);
            items.forEach((el, i) => el.classList.toggle('active', i === activeSuggestionIdx));
        } else if (e.key === 'Enter') {
            if (activeSuggestionIdx >= 0 && items?.length) {
                e.preventDefault();
                selectSuggestion(items[activeSuggestionIdx]);
            } else {
                hideSuggestions();
                searchCity(els.citySearch.value);
            }
        } else if (e.key === 'Escape') {
            hideSuggestions();
        }
    });

    els.citySearch.addEventListener('blur', () => {
        setTimeout(hideSuggestions, 150);
    });

    els.locationBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            state.lat = pos.coords.latitude;
            state.lon = pos.coords.longitude;
            if (DEBUG) { state._debug.geoSource = 'GPS ✓ (handmatig)'; renderDebug(); }
            fetchWeather();
            updateBuienradar();
            reverseGeocode(state.lat, state.lon);
            onLocationGranted();
        });
    });

    els.searchToggle?.addEventListener('click', () => {
        const isCollapsed = els.searchContainer.classList.toggle('collapsed');
        els.searchToggle.classList.toggle('active', !isCollapsed);
        if (!isCollapsed) els.citySearch.focus();
    });

    if (window.lucide) lucide.createIcons();
}

function updateTime() {
    if (!els.currentTime) return;
    els.currentTime.innerText = new Date().toLocaleTimeString('nl-NL', {
        hour: '2-digit', minute: '2-digit',
        timeZone: state.timezone
    });
}

function updateBuienradar() {
    if (!els.buienradarFrame) return;
    els.buienradarFrame.src = `https://gadgets.buienradar.nl/gadget/zoommap/?lat=${state.lat}&lng=${state.lon}&overname=2&zoom=10&pins=0&naam=${encodeURIComponent(state.city)}`;
}

async function searchCity(query) {
    if (!query) return;
    try {
        const res = await fetch(`${CONFIG.GEO_API_URL}?name=${encodeURIComponent(query)}&count=1&language=nl&format=json`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const loc = data.results[0];
            state.lat = loc.latitude;
            state.lon = loc.longitude;
            state.city = loc.name;
            els.cityName.innerText = state.city;
            fetchWeather();
            updateBuienradar();
            if (!els.searchToggle.classList.contains('hidden')) {
                els.searchContainer.classList.add('collapsed');
                els.searchToggle.classList.remove('active');
            }
        }
    } catch (err) {
        console.error("Zoektocht mislukt:", err);
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const data = await res.json();
        state.city = data.address.city || data.address.town || data.address.village || t('geocode_here');
        els.cityName.innerText = state.city;
        updateBuienradar();
    } catch (err) {
        els.cityName.innerText = t('geocode_unknown');
    }
}

async function fetchWeather() {
    const params = new URLSearchParams({
        latitude: state.lat,
        longitude: state.lon,
        current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'wind_speed_10m', 'wind_direction_10m'],
        hourly: ['temperature_2m', 'weather_code', 'dew_point_2m', 'precipitation', 'uv_index'],
        minutely_15: ['precipitation'],
        daily: ['sunrise', 'sunset'],
        timezone: 'auto',
        forecast_days: 2
    });

    try {
        const res = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
        const data = await res.json();
        updateUI(data);
    } catch (err) {
        console.error("Weer ophalen mislukt:", err);
    }
}

function getBeaufort(kmh) {
    if (kmh < 1) return 0;
    if (kmh <= 5) return 1;
    if (kmh <= 11) return 2;
    if (kmh <= 19) return 3;
    if (kmh <= 28) return 4;
    if (kmh <= 38) return 5;
    if (kmh <= 49) return 6;
    if (kmh <= 61) return 7;
    if (kmh <= 74) return 8;
    if (kmh <= 88) return 9;
    if (kmh <= 102) return 10;
    if (kmh <= 117) return 11;
    return 12;
}

function updateUI(data) {
    const current = data.current;

    // Store location timezone from API so time calculations use the searched city's local time
    if (data.utc_offset_seconds !== undefined) state.utcOffsetSeconds = data.utc_offset_seconds;
    if (data.timezone) state.timezone = data.timezone;

    els.currentTemp.innerText = `${Math.round(current.temperature_2m)}°`;
    if (els.feelsLike) els.feelsLike.innerText = `${Math.round(current.apparent_temperature)}°`;
    if (els.humidity) els.humidity.innerText = `${Math.round(current.relative_humidity_2m)}%`;

    const bft = getBeaufort(current.wind_speed_10m);
    if (els.windForce) els.windForce.innerText = `${bft} Bft`;
    if (els.windArrow) {
        els.windArrow.style.transform = `rotate(${current.wind_direction_10m}deg)`;
    }

    // Show Buienradar only when viewing a Dutch location
    const buienradarSection = document.getElementById('buienradar-section');
    if (buienradarSection) buienradarSection.classList.toggle('hidden', !isInNetherlands());

    const hourIdx = locationHour();
    const dp = data.hourly.dew_point_2m[hourIdx];
    if (els.dewPoint) els.dewPoint.innerText = `${Math.round(dp)}°`;

    const weatherDesc = getWeatherDesc(current.weather_code);
    if (els.weatherDesc) els.weatherDesc.innerText = weatherDesc;
    if (els.weatherIcon) {
        els.weatherIcon.src = getMeteoconSrc(current.weather_code, current.is_day);
        els.weatherIcon.alt = weatherDesc;
    }
    if (window.lucide) lucide.createIcons();

    updateComfortLevel(dp, current.temperature_2m);
    const currentUV = data.hourly.uv_index?.[hourIdx] ?? 0;
    generateRecommendation(current, dp, currentUV);
    state._lastHourly = data.hourly;
    state._lastMinutely15 = data.minutely_15;
    state._lastDaily = data.daily;
    renderChart(data.hourly, data.minutely_15);
    renderUVChart(data.hourly, data.daily);
    if (DEBUG) {
        state._debug.temp = Math.round(current.temperature_2m);
        state._debug.feelsLike = Math.round(current.apparent_temperature);
        state._debug.wind = bft;
        state._debug.humidity = Math.round(current.relative_humidity_2m);
        state._debug.dewPoint = Math.round(dp);
        state._debug.weatherCode = current.weather_code;
        renderDebug();
    }
    fetchWeatherAlerts().then(renderAlerts);
}

function updateComfortLevel(dewPoint, temp) {
    const tempF = (temp * 9 / 5) + 32;
    const dpF = (dewPoint * 9 / 5) + 32;
    const sum = tempF + dpF;

    if (!els.comfortContainer) return;
    els.comfortContainer.classList.remove('hidden');
    let level = "";
    let cssClass = "";

    if (sum <= 100) {
        level = t('comfort_perfect');  cssClass = "very-comfortable";
    } else if (sum <= 110) {
        level = t('comfort_good');     cssClass = "comfortable";
    } else if (sum <= 120) {
        level = t('comfort_sticky');   cssClass = "humid";
    } else if (sum <= 130) {
        level = t('comfort_warm');     cssClass = "uncomfortable";
    } else if (sum <= 140) {
        level = t('comfort_tacky');    cssClass = "uncomfortable";
    } else if (sum <= 150) {
        level = t('comfort_tough');    cssClass = "oppressive";
    } else if (sum <= 160) {
        level = t('comfort_heavy');    cssClass = "oppressive";
    } else if (sum <= 170) {
        level = t('comfort_suffer');   cssClass = "oppressive";
    } else if (sum <= 180) {
        level = t('comfort_extreme');  cssClass = "oppressive";
    } else {
        level = t('comfort_stop');     cssClass = "oppressive";
    }

    if (els.comfortLevel) {
        els.comfortLevel.innerHTML = `<strong>${level}</strong>`;
    }
    els.comfortContainer.className = `comfort-badge ${cssClass}`;
}

const METEOCON_BASE = 'https://cdn.jsdelivr.net/npm/@meteocons/svg@0.1.0/fill/';

const METEOCON_MAP = {
    0:  ['clear-day',         'clear-night'],
    1:  ['mostly-clear-day',  'mostly-clear-night'],
    2:  ['partly-cloudy-day', 'partly-cloudy-night'],
    3:  ['overcast',          'overcast'],
    45: ['fog-day',           'fog-night'],
    48: ['fog-day',           'fog-night'],
    51: ['drizzle',           'drizzle'],
    53: ['drizzle',           'drizzle'],
    55: ['drizzle',           'drizzle'],
    56: ['sleet',             'sleet'],
    57: ['sleet',             'sleet'],
    61: ['rain',              'rain'],
    63: ['rain',              'rain'],
    65: ['rain',              'rain'],
    66: ['sleet',             'sleet'],
    67: ['sleet',             'sleet'],
    71: ['snow',              'snow'],
    73: ['snow',              'snow'],
    75: ['snow',              'snow'],
    77: ['snow',              'snow'],
    80: ['rain',              'rain'],
    81: ['rain',              'rain'],
    82: ['rain',              'rain'],
    85: ['snow',              'snow'],
    86: ['snow',              'snow'],
    95: ['thunderstorms-day', 'thunderstorms-night'],
    96: ['thunderstorms',     'thunderstorms'],
    99: ['extreme-thunderstorms', 'extreme-thunderstorms'],
};

function getMeteoconSrc(code, isDay) {
    const pair = METEOCON_MAP[code] || ['overcast', 'overcast'];
    return METEOCON_BASE + pair[isDay === 1 ? 0 : 1] + '.svg';
}

function getWeatherDesc(code) {
    const map = {
        0:  'weather_0',  1:  'weather_1',  2:  'weather_2',
        3:  'weather_3',  45: 'weather_45', 51: 'weather_51',
        61: 'weather_61', 71: 'weather_71', 95: 'weather_95',
    };
    return t(map[code] || 'weather_default');
}

function buildClothingItems(temp, bft, uvIndex) {
    const items = [];
    if (temp > 7) {
        items.push(t('clothing_base_hot'));
    } else if (temp >= 4) {
        items.push(t('clothing_base_mild_long'));
    } else if (temp >= 1) {
        items.push(t('clothing_base_mild_soft'));
    } else {
        items.push(t('clothing_base_cold'));
        if (temp < 0) {
            items.push(t('clothing_add_gloves'));
            items.push(t('clothing_add_hat'));
        }
    }
    if (temp < 10 && bft >= 5) items.push(t('clothing_add_windjack'));
    if (uvIndex > 3) items.push(t('clothing_add_sunscreen'));
    if (uvIndex > 4) items.push(t('clothing_add_cap'));
    items.push(t('clothing_add_id'));
    return items;
}

function generateRecommendation(current, dewPoint, uvIndex = 0) {
    const temp = current.temperature_2m;
    const feelsLike = current.apparent_temperature;
    const bft = getBeaufort(current.wind_speed_10m);
    const hour = locationHour();

    const issues = [];
    function flag(score, msg) { issues.push({ score, msg }); }

    const dp = Math.round(dewPoint);
    const fl = Math.round(feelsLike);
    const uv = uvIndex.toFixed(1);

    // Dew point
    if (dewPoint > 21)      flag(3, t('warn_dew_extreme',    { temp: dp }));
    else if (dewPoint > 18) flag(2, t('warn_dew_high',       { temp: dp }));
    else if (dewPoint > 13) flag(1, t('warn_dew_moderate',   { temp: dp }));

    // Feels-like temperature
    if (feelsLike > 35)       flag(3, t('warn_feels_very_hot',  { temp: fl }));
    else if (feelsLike > 30)  flag(2, t('warn_feels_hot',       { temp: fl }));
    else if (feelsLike > 25)  flag(1, t('warn_feels_warm',      { temp: fl }));
    else if (feelsLike < -20) flag(3, t('warn_feels_very_cold', { temp: fl }));
    else if (feelsLike < -15) flag(2, t('warn_feels_cold',      { temp: fl }));
    else if (feelsLike < -10) flag(1, t('warn_feels_cool',      { temp: fl }));

    // UV index (peak exposure 10:00–16:00)
    if (hour >= 10 && hour < 16) {
        if (uvIndex >= 8)      flag(3, t('warn_uv_extreme',  { uv }));
        else if (uvIndex >= 6) flag(2, t('warn_uv_high',     { uv }));
        else if (uvIndex >= 5) flag(1, t('warn_uv_moderate', { uv }));
    } else if (uvIndex >= 8) {
        flag(1, t('warn_uv_low', { uv }));
    }

    // Wind
    if (bft >= 9)      flag(3, t('warn_wind_storm',    { bft }));
    else if (bft >= 7) flag(2, t('warn_wind_strong',   { bft }));
    else if (bft >= 6) flag(1, t('warn_wind_moderate', { bft }));

    const maxScore = issues.length ? Math.max(...issues.map(i => i.score)) : 0;
    const redIssues = issues.filter(i => i.score === 3);
    const secondaryIssues = issues.filter(i => i.score < 3);

    const clothingItems = buildClothingItems(temp, bft, uvIndex);
    const clothingHTML = `<ul class="clothing-list">${clothingItems.map(i => `<li>${i}</li>`).join('')}</ul>`;

    let badge, type, tip;

    if (maxScore >= 3) {
        badge = t('rec_red');
        type = 'danger';
        const hasCold = redIssues.some(i => i.msg.includes('🥶'));
        const hasWind = redIssues.some(i => i.msg.includes('💨'));
        const suggestion = hasCold ? t('suggest_cold') : hasWind ? t('suggest_wind') : t('suggest_heat');
        tip = `<strong>${t('rec_not_now')}</strong><br>${redIssues.map(i => i.msg).join('<br>')}<br><em>${suggestion}</em><br><br>${clothingHTML}`;
    } else if (maxScore === 2) {
        badge = t('rec_orange');
        type = 'caution';
        tip = `<strong>${t('rec_be_careful')}</strong><br>${issues.filter(i => i.score >= 2).map(i => i.msg).join('<br>')}<br><br>${clothingHTML}`;
    } else if (maxScore === 1) {
        badge = t('rec_yellow');
        type = 'warning';
        tip = `<strong>${t('rec_not_perfect')}</strong><br>${issues.map(i => i.msg).join('<br>')}<br><br>${clothingHTML}`;
    } else {
        if (temp < 0)        badge = t('rec_green_freezing');
        else if (temp <= 7)  badge = t('rec_green_cold');
        else if (temp <= 22) badge = t('rec_green_mild');
        else                 badge = t('rec_green_warm');
        type = 'success';
        tip = clothingHTML;
    }

    if (els.recommendationBadge) {
        els.recommendationBadge.innerText = badge;
        els.recommendationBadge.className = `badge ${type}`;
    }
    if (els.clothingTip) els.clothingTip.innerHTML = tip;

    if (els.warnings) {
        const showWarnings = maxScore >= 3 && secondaryIssues.length > 0
            ? secondaryIssues.map(i => i.msg)
            : [];
        if (showWarnings.length > 0) {
            els.warnings.innerHTML = `<strong>${t('rec_also')}</strong> ` + showWarnings.join(' · ');
            els.warnings.classList.remove('hidden');
        } else {
            els.warnings.classList.add('hidden');
        }
    }
}

function chartTheme() {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
        dark,
        canvasBg:      cssVar('--chart-bg')             || (dark ? '#1a1b1e'                : '#ffffff'),
        gridColor:     cssVar('--chart-grid')            || (dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'),
        tickColor:     cssVar('--chart-tick')            || (dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'),
        tooltipBg:     cssVar('--chart-tooltip-bg')      || (dark ? 'rgba(25,25,25,0.97)'  : 'rgba(255,255,255,0.97)'),
        tooltipText:   cssVar('--chart-tooltip-text')    || (dark ? '#e0e0e0'               : '#1a1b1e'),
        tooltipBorder: cssVar('--chart-tooltip-border')  || (dark ? 'rgba(255,255,255,0.15)': 'rgba(0,0,0,0.1)'),
    };
}

function renderChart(hourly, minutely15) {
    const nowISO = locationISO().substring(0, 14) + '00';
    const labels = [], temps = [], rain = [], timestamps = [];

    if (minutely15?.time?.length) {
        let m15Start = minutely15.time.findIndex(t => t >= nowISO);
        if (m15Start === -1) m15Start = 0;
        let lastHourTemp = null;
        for (let i = 0; i < 24; i++) {
            const idx = m15Start + i * 2;
            if (idx >= minutely15.time.length) break;
            const ts = minutely15.time[idx];
            const min = ts.substring(14, 16);
            const hour = parseInt(ts.substring(11, 13), 10);
            const day = new Date(ts).toLocaleDateString(state.lang + '-' + state.lang.toUpperCase(), { weekday: 'short' });
            labels.push(min === '00' && hour % 4 === 0
                ? (hour === 0 ? `${day} 0:00` : `${hour}:00`)
                : '');
            timestamps.push(hour === 0 ? `${day} 0:${min}` : `${hour}:${min}`);
            if (min === '00') {
                const hIdx = hourly.time.findIndex(t => t.startsWith(ts.substring(0, 13)));
                lastHourTemp = hIdx !== -1 ? hourly.temperature_2m[hIdx] : null;
            }
            temps.push(lastHourTemp);
            const p0 = minutely15.precipitation[idx] || 0;
            const p1 = minutely15.precipitation[idx + 1] || 0;
            rain.push(p0 + p1);
        }
    } else {
        let startIndex = hourly.time.findIndex(t => t >= nowISO);
        if (startIndex === -1) startIndex = 0;
        for (let i = startIndex; i < startIndex + 12; i++) {
            if (hourly.temperature_2m[i] === undefined) break;
            const hour = parseInt(hourly.time[i].substring(11, 13), 10);
            const day = new Date(hourly.time[i]).toLocaleDateString(state.lang + '-' + state.lang.toUpperCase(), { weekday: 'short' });
            labels.push(hour % 4 === 0 ? (hour === 0 ? `${day} 0:00` : `${hour}:00`) : '');
            timestamps.push(hour === 0 ? `${day} 0:00` : `${hour}:00`);
            temps.push(hourly.temperature_2m[i]);
            rain.push(Math.max(0, hourly.precipitation[i] || 0));
        }
    }

    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const apexBase = {
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: false },
        background: 'transparent',
        fontFamily: 'Inter, sans-serif',
        syncId: 'weather'
    };
    const apexTheme = { mode: dark ? 'dark' : 'light' };
    const apexXaxis = {
        categories: labels,
        labels: { rotate: 0, style: { fontSize: '11px' }, hideOverlappingLabels: false },
        axisTicks: { show: false },
        tooltip: { enabled: false }
    };
    const apexGrid = {
        borderColor: cssVar('--chart-grid') || (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.07)'),
        xaxis: { lines: { show: true } }
    };
    const xFormatter = (_, opts) => timestamps[opts?.dataPointIndex] ?? '';

    // Temperatuurgrafiek
    if (state.tempChart) { state.tempChart.destroy(); state.tempChart = null; }
    const tempEl = document.getElementById('temp-chart');
    if (tempEl) {
        state.tempChart = new ApexCharts(tempEl, {
            chart: { ...apexBase, type: 'area', height: '100%' },
            theme: apexTheme,
            series: [{ name: '°C', data: temps }],
            xaxis: { ...apexXaxis },
            yaxis: {
                labels: { formatter: v => Math.round(v), style: { fontSize: '11px' } },
                tickAmount: 4
            },
            colors: [cssVar('--temp') || '#D93025'],
            fill: { type: 'gradient', gradient: { opacityFrom: 0.18, opacityTo: 0.02 } },
            stroke: { curve: 'smooth', width: 2 },
            dataLabels: { enabled: false },
            legend: { show: false },
            markers: { size: 0 },
            tooltip: {
                shared: true, intersect: false,
                x: { formatter: xFormatter },
                y: { formatter: v => String(Math.round(v)) }
            },
            grid: apexGrid
        });
        state.tempChart.render();
    }

    // Regengrafiek
    if (state.rainChart) { state.rainChart.destroy(); state.rainChart = null; }
    const rainEl = document.getElementById('rain-chart');
    if (rainEl) {
        state.rainChart = new ApexCharts(rainEl, {
            chart: { ...apexBase, type: 'bar', height: '100%' },
            theme: apexTheme,
            series: [{ name: 'mm', data: rain }],
            xaxis: { ...apexXaxis },
            yaxis: {
                min: 0, max: 3, tickAmount: 3,
                labels: { formatter: v => v, style: { fontSize: '11px' } }
            },
            colors: [cssVar('--rain') || '#1a73e8'],
            plotOptions: { bar: { columnWidth: '80%', borderRadius: 2, minHeight: 2 } },
            dataLabels: { enabled: false },
            legend: { show: false },
            tooltip: {
                shared: true, intersect: false,
                x: { formatter: xFormatter },
                y: { formatter: v => v.toFixed(1) + ' mm' }
            },
            grid: apexGrid
        });
        state.rainChart.render();
    }
}

// ---- UV / Zonkracht ----

const UV_ZONES = [
    { min: 0,   max: 2.5,      color: '#57BB8A' },
    { min: 2.5, max: 4.5,      color: '#F9AB00' },
    { min: 4.5, max: 6.5,      color: '#F57C00' },
    { min: 6.5, max: Infinity, color: '#D93025' }
];

function uvZoneColor(v) {
    if (v < 2.5) return '#57BB8A';
    if (v < 4.5) return '#F9AB00';
    if (v < 6.5) return '#F57C00';
    return '#D93025';
}

const canvasBgPlugin = {
    id: 'canvasBg',
    beforeDraw(chart) {
        const bg = chartTheme().canvasBg;
        if (!bg || bg === 'transparent') return;
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
};

const crosshairPlugin = {
    id: 'crosshair',
    afterDraw(chart) {
        const active = chart.tooltip?._active;
        if (!active?.length) return;
        const { ctx, chartArea: { top, bottom } } = chart;
        const x = active[0].element.x;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(200, 0, 0, 0.35)';
        ctx.stroke();
        ctx.restore();
    }
};

const uvAreaFillPlugin = {
    id: 'uvAreaFill',
    beforeDatasetsDraw(chart) {
        const meta = chart.getDatasetMeta(1);
        const data = chart.data.datasets[1]?.data;
        if (!meta || !data) return;

        const { ctx, scales: { y } } = chart;
        const baselineY = y.getPixelForValue(0);

        ctx.save();
        for (let i = 0; i < meta.data.length - 1; i++) {
            const valueA = data[i];
            const valueB = data[i + 1];
            if (valueA === null || valueA === undefined || valueB === null || valueB === undefined) continue;

            const ptA = meta.data[i];
            const ptB = meta.data[i + 1];

            ctx.fillStyle = uvZoneColor(Math.max(valueA, valueB)) + 'cc';
            ctx.beginPath();
            ctx.moveTo(ptA.x, ptA.y);
            ctx.lineTo(ptB.x, ptB.y);
            ctx.lineTo(ptB.x, baselineY);
            ctx.lineTo(ptA.x, baselineY);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }
};

function wgs84ToRD(lat, lon) {
    const dφ = 0.36 * (lat - 52.15517440);
    const dλ = 0.36 * (lon - 5.38720621);
    const x = 155000
        + 190094.945 * dλ
        - 11832.228 * dφ * dλ
        - 114.221 * Math.pow(dλ, 3)
        - 32.391 * Math.pow(dφ, 2) * dλ
        - 2.340 * Math.pow(dφ, 3) * dλ
        - 0.608 * dφ * Math.pow(dλ, 3);
    const y = 463000
        + 309056.544 * dφ
        + 3638.893 * Math.pow(dλ, 2)
        - 157.984 * Math.pow(dφ, 2)
        - 0.054 * Math.pow(dφ, 4)
        - 9.367 * dφ * Math.pow(dλ, 2)
        - 0.003 * Math.pow(dλ, 4);
    return { x: Math.round(x), y: Math.round(y) };
}

function renderDebug() {
    if (!DEBUG) return;
    const el = document.getElementById('debug-panel');
    if (!el) return;
    const d = state._debug;
    el.innerHTML = [
        `<b>Geo</b>: ${d.geoSource} | ${state.lat.toFixed(5)}°N ${state.lon.toFixed(5)}°E | ${state.city}`,
        `<b>RD New</b>: x=${d.rdX ?? '–'} y=${d.rdY ?? '–'} &nbsp; <b>WMS I/J</b>: ${d.wmsI ?? '–'} / ${d.wmsJ ?? '–'}`,
        `<b>RIVM</b>: ${d.rivmStatus} &nbsp; <b>UV model</b>: <b>${d.uvSource}</b>`,
        `<b>UV huidig</b>: ${d.uvCurrent ?? '–'} | <b>UV max verwacht</b>: ${d.uvMax ?? '–'}`,
        `<b>Temp</b>: ${d.temp ?? '–'}°C | <b>Gevoel</b>: ${d.feelsLike ?? '–'}°C | <b>Wind</b>: ${d.wind ?? '–'} Bft`,
        `<b>Vocht</b>: ${d.humidity ?? '–'}% | <b>Dauw</b>: ${d.dewPoint ?? '–'}°C | <b>WC</b>: ${d.weatherCode ?? '–'}`
    ].join('<br>');
}

async function fetchRIVMUV() {
    try {
        const rd = wgs84ToRD(state.lat, state.lon);
        if (DEBUG) { state._debug.rdX = rd.x; state._debug.rdY = rd.y; renderDebug(); }
        if (rd.x < -150000 || rd.x > 450000 || rd.y < 100000 || rd.y > 800000) {
            if (DEBUG) { state._debug.rivmStatus = 'buiten NL BBOX'; renderDebug(); }
            return null;
        }
        const I = Math.round((rd.x + 150000) / 600000 * 900);
        const J = Math.round((800000 - rd.y)  / 700000 * 900);
        if (DEBUG) { state._debug.wmsI = I; state._debug.wmsJ = J; renderDebug(); }
        if (I < 0 || I >= 900 || J < 0 || J >= 900) {
            if (DEBUG) { state._debug.rivmStatus = 'I/J buiten bereik'; renderDebug(); }
            return null;
        }
        const url = `https://data.rivm.nl/geo/alo/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&QUERY_LAYERS=rivm_zonkracht&LAYERS=rivm_zonkracht&INFO_FORMAT=application/json&FEATURE_COUNT=1&I=${I}&J=${J}&CRS=EPSG:28992&WIDTH=900&HEIGHT=900&BBOX=-150000,100000,450000,800000`;
        if (DEBUG) { state._debug.rivmStatus = 'ophalen…'; renderDebug(); }
        const res = await fetch(url);
        const data = await res.json();
        if (data.features?.length > 0) {
            if (DEBUG) { state._debug.rivmStatus = `ok (${data.features.length} feature(s))`; renderDebug(); }
            return data.features[0].properties;
        }
        if (DEBUG) { state._debug.rivmStatus = 'geen features in response'; renderDebug(); }
    } catch (e) {
        console.warn('RIVM UV niet beschikbaar:', e.message);
        if (DEBUG) { state._debug.rivmStatus = 'fout: ' + e.message; renderDebug(); }
    }
    return null;
}

function parseRIVMBands(props, startBand, endBand) {
    const result = new Array(96).fill(null);
    const utcOffsetMin = (state.utcOffsetSeconds || 0) / 60;
    for (let k = 0; k < endBand - startBand + 1; k++) {
        const val = props['Band' + (startBand + k)];
        if (val === undefined || val === null || val < 0) continue;
        const localMin = 180 + k * 15 + utcOffsetMin;
        const localQuarter = Math.floor(localMin / 15);
        if (localQuarter < 0 || localQuarter > 95) continue;
        result[localQuarter] = val;
    }
    return result;
}

function getUVLevel(uv) {
    if (uv < 1)   return { label: t('uv_none'),     cls: 'uv-none',      color: '#9E9E9E', tip: '' };
    if (uv < 2.5) return { label: t('uv_low'),      cls: 'uv-low',       color: '#57BB8A', tip: '' };
    // tip: t('uv_tip_none') / t('uv_tip_low') removed — no advice needed for low UV
    if (uv < 4.5) return { label: t('uv_moderate'), cls: 'uv-moderate',  color: '#F9AB00', tip: t('uv_tip_moderate') };
    if (uv < 6.5) return { label: t('uv_high'),     cls: 'uv-high',      color: '#F57C00', tip: t('uv_tip_high') };
    return         { label: t('uv_very_high'),       cls: 'uv-very-high', color: '#D93025', tip: t('uv_tip_very_high') };
}

function renderUVChart(hourly, daily) {
    try {
        _renderUVChart(hourly, daily);
    } catch (e) {
        console.error('UV-grafiek fout:', e);
        if (DEBUG) { state._debug.rivmStatus = 'RENDER FOUT: ' + e.message + ' @ ' + (e.stack?.split('\n')[1]?.trim() ?? '?'); renderDebug(); }
    }
}

function _renderUVChart(hourly, daily) {
    const canvas = document.getElementById('uv-chart');
    if (!canvas) return;

    const uvIndex = hourly?.uv_index ?? [];

    const today = locationISO().substring(0, 10);
    // Try today first; if not found try the first available date
    let todayStart = hourly.time.findIndex(t => t.startsWith(today));
    if (todayStart === -1) todayStart = 0;

    // X-axis window: 1h before sunrise → 1h after sunset, min 12h
    let startHour = 5, endHour = 21;
    const sunriseStr = daily?.sunrise?.find(s => s.startsWith(today));
    const sunsetStr  = daily?.sunset?.find(s => s.startsWith(today));
    if (sunriseStr && sunsetStr) {
        const riseH = parseInt(sunriseStr.substring(11, 13), 10);
        const setH  = parseInt(sunsetStr.substring(11, 13), 10);
        startHour = Math.max(0, riseH - 1);
        endHour   = Math.min(23, setH + 1);
        if (endHour - startHour < 12) {
            const mid = Math.round((startHour + endHour) / 2);
            startHour = Math.max(0, mid - 6);
            endHour   = Math.min(23, mid + 6);
        }
    }

    // Build 15-min labels
    const labels = [];
    for (let h = startHour; h <= endHour; h++) {
        if (todayStart + h >= hourly.time.length) break;
        for (let q = 0; q < 4; q++) {
            labels.push(`${String(h).padStart(2, '0')}:${String(q * 15).padStart(2, '0')}`);
        }
    }

    // Open-Meteo fallback: hourly value repeated over 4 quarters
    const omPredicted = [];
    for (let h = startHour; h <= endHour; h++) {
        const idx = todayStart + h;
        if (idx >= hourly.time.length) break;
        const uvVal = uvIndex[idx] ?? 0;
        for (let q = 0; q < 4; q++) omPredicted.push(uvVal);
    }

    const currentHour = locationHour();
    const currentQuarterInSlice = (currentHour - startHour) * 4 + Math.floor(locationMinute() / 15);

    const currentEl = document.getElementById('uv-current');
    const maxEl     = document.getElementById('uv-max');
    const levelEl   = document.getElementById('uv-level');
    const tipEl     = document.getElementById('uv-tip');

    // Initial UI from Open-Meteo
    const maxUVom = Math.max(...omPredicted);
    const currentUVValue = uvIndex[todayStart + currentHour] ?? 0;
    const uvInfoCur = getUVLevel(currentUVValue);
    if (currentEl) currentEl.innerText = currentUVValue.toFixed(1);
    if (maxEl) maxEl.innerText = maxUVom.toFixed(1);
    if (levelEl) { levelEl.innerText = uvInfoCur.label; levelEl.className = `uv-badge ${uvInfoCur.cls}${uvInfoCur.cls === 'uv-none' ? ' hidden' : ''}`; }
    if (tipEl) tipEl.innerText = uvInfoCur.tip;

    // Initial draw: Open-Meteo predicted + measured up to now
    const omMeasured = omPredicted.map((v, i) => i <= currentQuarterInSlice ? v : null);
    drawUVChart(canvas, labels, omPredicted, omMeasured);
    if (DEBUG) { state._debug.uvSource = 'open-meteo'; state._debug.uvCurrent = currentUVValue.toFixed(1); state._debug.uvMax = maxUVom.toFixed(1); renderDebug(); }

    fetchRIVMUV().then(rivm => {
        if (!rivm) return;

        // Band4-75 = RIVM max. expected; Band76-147 = RIVM measured
        const rivmExpected = parseRIVMBands(rivm, 4, 75);
        const rivmMeasured = parseRIVMBands(rivm, 76, 147);

        const sliceExpected = [];
        const sliceMeasured = [];
        for (let h = startHour; h <= endHour; h++) {
            for (let q = 0; q < 4; q++) {
                sliceExpected.push(rivmExpected[h * 4 + q] ?? null);
                sliceMeasured.push(rivmMeasured[h * 4 + q] ?? null);
            }
        }
        if (!sliceExpected.some(v => v !== null)) {
            if (DEBUG) { state._debug.rivmStatus += ' (slice leeg)'; renderDebug(); }
            return;
        }

        // Max UV from RIVM expected
        const maxUVrivm = Math.max(...sliceExpected.filter(v => v !== null), 0);
        if (maxEl) maxEl.innerText = maxUVrivm.toFixed(1);
        if (DEBUG) { state._debug.uvSource = 'rivm'; state._debug.uvMax = maxUVrivm.toFixed(1); renderDebug(); }

        // Current UV: latest RIVM measured, else RIVM expected for current quarter
        const curQuarter = currentHour * 4 + Math.floor(locationMinute() / 15);
        let curVal = null;
        for (let qIdx = curQuarter; qIdx >= 0 && curVal === null; qIdx--) {
            if (rivmMeasured[qIdx] !== null) curVal = rivmMeasured[qIdx];
        }
        if (curVal === null) curVal = rivmExpected[curQuarter];
        if (curVal !== null && currentEl) {
            currentEl.innerText = curVal.toFixed(1);
            currentEl.title = t('rivm_measured');
            const uvInfoRivm = getUVLevel(curVal);
            if (levelEl) { levelEl.innerText = uvInfoRivm.label; levelEl.className = `uv-badge ${uvInfoRivm.cls}${uvInfoRivm.cls === 'uv-none' ? ' hidden' : ''}`; }
            if (tipEl) tipEl.innerText = uvInfoRivm.tip;
            if (DEBUG) { state._debug.uvCurrent = curVal.toFixed(1); renderDebug(); }
        }

        drawUVChart(canvas, labels, sliceExpected, sliceMeasured);
    });
}

function drawUVChart(canvas, labels, predicted, measured) {
    const ctx = canvas.getContext('2d');
    if (state.uvChart) state.uvChart.destroy();
    const theme = chartTheme();

    const maxPredicted = Math.max(...predicted.filter(v => v !== null && v > 0), 0);
    const maxMeasured  = Math.max(...measured.filter(v => v !== null && v > 0), 0);
    const chartMax = Math.max(maxPredicted, maxMeasured);

    state.uvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: t('uv_label_predicted'),
                    data: predicted,
                    borderColor: theme.dark ? 'rgba(255,255,255,0.7)' : (cssVar('--accent-warm') || '#F57C00'),
                    borderDash: [3, 4],
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 1.5,
                    spanGaps: true
                },
                {
                    label: t('uv_label_measured'),
                    data: measured,
                    borderColor: cssVar('--accent') || '#1565C0',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.15,
                    pointRadius: 1.5,
                    pointBackgroundColor: cssVar('--accent') || '#1565C0',
                    pointBorderColor: cssVar('--accent') || '#1565C0',
                    borderWidth: 2.5,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: theme.tooltipBg,
                    titleColor: theme.tooltipText,
                    bodyColor: theme.tooltipText,
                    borderColor: theme.tooltipBorder,
                    borderWidth: 1,
                    callbacks: {
                        label: item => item.parsed.y !== null
                            ? `${item.dataset.label}: ${item.parsed.y.toFixed(1)}`
                            : null
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, font: { size: 11 }, color: theme.tickColor }
                },
                y: {
                    min: 0,
                    suggestedMax: Math.max(Math.ceil(chartMax) + 1, 3),
                    grid: { color: theme.gridColor },
                    ticks: { font: { size: 11 }, color: theme.tickColor }
                }
            }
        },
        plugins: [canvasBgPlugin, uvAreaFillPlugin, crosshairPlugin]
    });
}

init();
