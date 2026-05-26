const WARN = { green: '#22C55E', yellow: '#FACC15', orange: '#F97316', red: '#EF4444', none: '#9E9E9E' };

const FEATURE_THEME = 'beter'; // 'default' of 'beter'
document.documentElement.dataset.theme = FEATURE_THEME;

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function storageGet(key) {
    try { return localStorage.getItem(key); }
    catch { return null; }
}

function storageSet(key, value) {
    try { localStorage.setItem(key, value); }
    catch { /* file:// previews may block storage */ }
}

function detectLanguage() {
    const supported = Object.keys(STRINGS);
    const requested = new URLSearchParams(window.location.search).get('lang');
    if (requested && supported.includes(requested)) return requested;
    const saved = storageGet('hw_lang');
    if (saved && supported.includes(saved)) return saved;
    const browser = (navigator.language || 'nl').split('-')[0].toLowerCase();
    return supported.includes(browser) ? browser : 'nl';
}

function reloadWithLanguage(lang) {
    storageSet('hw_lang', lang);
    const url = new URL(window.location.href);
    url.searchParams.set('lang', lang);
    window.location.assign(url.toString());
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

const URL_COUNTRIES = {
    'nederland': 'NL',
    'duitsland': 'DE',
};
const URL_COUNTRY_SLUGS = Object.fromEntries(Object.entries(URL_COUNTRIES).map(([k, v]) => [v, k]));

const JSONBIN_URL = 'https://api.jsonbin.io/v3/b/6a11e4176610dd3ae893718d';
const JSONBIN_KEY = '$2a$10$fZv7/kP647Xa2MVZtkuHWurVi3tkS10v0N/NN8gBCwiZy9Wft0cQ.';
let _translationCache = null; // in-memory, loaded once per sessie

function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36);
}

async function getTranslationCache() {
    if (_translationCache !== null) return _translationCache;
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, {
            headers: { 'X-Access-Key': JSONBIN_KEY, 'X-Bin-Meta': 'false' }
        });
        _translationCache = res.ok ? await res.json() : {};
    } catch { _translationCache = {}; }
    return _translationCache;
}

async function saveTranslationCache(cache) {
    _translationCache = cache;
    try {
        await fetch(JSONBIN_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-Access-Key': JSONBIN_KEY },
            body: JSON.stringify(cache),
        });
    } catch (e) { console.warn('JSONBin write mislukt:', e); }
}

async function translateField(text, lang) {
    if (!text) return text;
    const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=nl|${lang}&de=olaflemmers@gmail.com`
    );
    const json = await res.json();
    return json?.responseData?.translatedText || text;
}

async function translateReport(fields, lang) {
    const hash = simpleHash(fields.body + fields.summary);
    const cacheKey = `${lang}_${hash}`;

    const cache = await getTranslationCache();
    if (cache[cacheKey]) return cache[cacheKey];

    const [title, summary, body, shortterm, longterm] = await Promise.all([
        translateField(fields.title, lang),
        translateField(fields.summary, lang),
        translateField(fields.body, lang),
        translateField(fields.shortterm, lang),
        translateField(fields.longterm, lang),
    ]);

    const result = { title, summary, body, shortterm, longterm };
    cache[cacheKey] = result;
    saveTranslationCache(cache); // fire-and-forget
    return result;
}

const els = {
    citySearch: document.getElementById('city-search'),
    cityName: document.getElementById('city-name'),
    currentTime: document.getElementById('current-time'),
    currentTemp: document.getElementById('current-temp'),
    weatherDesc: document.getElementById('weather-description'),
    windForce: document.getElementById('wind-force'),
    windArrow: document.getElementById('wind-arrow'),
    windDot: document.getElementById('wind-dot'),
    dewPoint: document.getElementById('dew-point'),
    dewDot: document.getElementById('dew-dot'),
    heroUV: document.getElementById('hero-uv'),
    uvDot: document.getElementById('uv-dot'),
    recommendationBadge: document.getElementById('recommendation-badge'),
    clothingTip: document.getElementById('clothing-tip'),
    warnings: document.getElementById('weather-warnings'),
    weatherIcon: document.getElementById('weather-icon'),
    comfortContainer: document.getElementById('comfort-container'),
    comfortLevel: document.getElementById('comfort-level'),
    buienradarFrame: document.getElementById('buienradar-frame'),
    searchContainer: document.getElementById('search-container'),
    searchToggle: document.getElementById('search-toggle'),
    searchSuggestions: document.getElementById('search-suggestions'),
    aqiOverlay: document.getElementById('aqi-overlay'),
    aqiOverlayBody: document.getElementById('aqi-overlay-body'),
    aqiPanelBody: document.getElementById('aqi-panel-body')
};

let state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    city: CONFIG.DEFAULT_CITY,
    tempChart: null,
    rainChart: null,
    dewpointChart: null,
    uvChart: null,
    windChart: null,
    weatherRequestId: 0,
    renderedWeatherRequestId: 0,
    utcOffsetSeconds: 3600,
    timezone: 'Europe/Amsterdam',
    lang: detectLanguage(),
    _debug: {
        geoSource: 'default',
        uvSource: 'open-meteo',
        rdX: null, rdY: null, wmsI: null, wmsJ: null,
        rivmStatus: '–',
        temp: null, feelsLike: null, wind: null, dewPoint: null,
        uvCurrent: null, uvMax: null, weatherCode: null,
        buienradarRain: '–'
    }
};

let activeMetric = null;

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

function isInGermany() {
    return state.lat >= 47.2 && state.lat <= 55.1 && state.lon >= 5.8 && state.lon <= 15.1;
}

// ---- URL routing ----

function toUrlSlug(str) {
    return str.toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function updateUrlForLocation(city, countryCode) {
    const countrySlug = URL_COUNTRY_SLUGS[countryCode?.toUpperCase()];
    if (!countrySlug) return;
    const citySlug = toUrlSlug(city);
    const existingLang = new URLSearchParams(window.location.search).get('lang');
    const langParam = existingLang ? `?lang=${existingLang}` : (state.lang !== 'nl' ? `?lang=${state.lang}` : '');
    history.pushState({ city, countryCode }, '', `/${countrySlug}/${citySlug}${langParam}`);
}

function showUrlFallbackMessage(type, city) {
    const el = document.getElementById('url-fallback-msg');
    if (!el) return;
    const msg = type === 'not_found'
        ? t('url_not_found', { city })
        : t('url_invalid');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 8000);
}

async function loadLocationFromUrl() {
    const path = window.location.pathname.replace(/\/$/, '');
    const parts = path.split('/').filter(Boolean);
    if (parts.length < 2) return false;

    const countryCode = URL_COUNTRIES[parts[0]];
    if (!countryCode) {
        if (parts.length >= 2) showUrlFallbackMessage('invalid');
        return false;
    }

    const cityQuery = parts[1].replace(/-/g, ' ');
    try {
        const res = await fetch(`${CONFIG.GEO_API_URL}?name=${encodeURIComponent(cityQuery)}&count=10&language=nl&format=json`);
        const data = await res.json();
        const results = (data.results || []).filter(r => r.country_code?.toUpperCase() === countryCode);
        if (!results.length) {
            showUrlFallbackMessage('not_found', cityQuery);
            return false;
        }
        const r = results[0];
        state.lat = r.latitude;
        state.lon = r.longitude;
        state.city = r.name;
        if (els.cityName) els.cityName.innerText = r.name;
        if (els.citySearch) els.citySearch.value = r.name;
        if (DEBUG) { state._debug.geoSource = `URL /${parts[0]}/${parts[1]}`; renderDebug(); }
        return true;
    } catch {
        showUrlFallbackMessage('invalid');
        return false;
    }
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
        return `<li class="search-suggestion-item" data-idx="${i}" data-lat="${r.latitude}" data-lon="${r.longitude}" data-name="${escAttr(r.name)}" data-country="${escAttr((r.country_code || '').toUpperCase())}">
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

function handleGPSSuggestion() {
    hideSuggestions();
    els.citySearch.value = '';
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            state.lat = pos.coords.latitude;
            state.lon = pos.coords.longitude;
            if (DEBUG) { state._debug.geoSource = 'GPS ✓ (handmatig)'; renderDebug(); }
            fetchWeather();
            updateBuienradar();
            reverseGeocode(state.lat, state.lon);
            onLocationGranted();
        },
        () => { /* denied – do nothing */ }
    );
}

function selectSuggestion(item) {
    if (item.dataset.action === 'gps') { handleGPSSuggestion(); return; }
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.dataset.name;
    const countryCode = item.dataset.country || '';
    state.lat = lat;
    state.lon = lon;
    state.city = name;
    els.cityName.innerText = name;
    els.citySearch.value = name;
    hideSuggestions();
    saveLastLocation();
    saveRecentLocation({ lat, lon, city: name, countryCode });
    updateUrlForLocation(name, countryCode);
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

// ---- Persistente locatie & recente geschiedenis ----

function saveLastLocation() {
    storageSet('hw_last_location', JSON.stringify({
        lat: state.lat, lon: state.lon, city: state.city
    }));
}

function loadLastLocation() {
    try { return JSON.parse(storageGet('hw_last_location')); }
    catch { return null; }
}

function loadRecentLocations() {
    try { return JSON.parse(storageGet('hw_recent_locations') || '[]'); }
    catch { return []; }
}

function saveRecentLocation(loc) {
    let recents = loadRecentLocations();
    recents = recents.filter(r => r.city.toLowerCase() !== loc.city.toLowerCase());
    recents.unshift(loc);
    storageSet('hw_recent_locations', JSON.stringify(recents.slice(0, 3)));
}

const GPS_ICON_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" class="suggestion-gps-icon"><path fill="currentColor" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.37 3.06 10.54H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>`;

function showRecentSuggestions() {
    const ul = els.searchSuggestions;
    if (!ul) return;
    const recents = loadRecentLocations();
    const sorted = [...recents].sort((a, b) => a.city.localeCompare(b.city, state.lang));

    const gpsItem = `<li class="search-suggestion-item is-gps" data-action="gps">
        <span class="suggestion-name">${GPS_ICON_SVG} ${escHtml(t('btn_my_location'))}</span>
    </li>`;

    const recentItems = sorted.map((r, i) =>
        `<li class="search-suggestion-item is-recent" data-idx="${i}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escAttr(r.city)}" data-country="${escAttr(r.countryCode || '')}">
            <span class="suggestion-name">🕐 ${escHtml(r.city)}</span>
        </li>`
    ).join('');

    ul.innerHTML = gpsItem + recentItems;
    ul.classList.remove('hidden');
    activeSuggestionIdx = -1;
    ul.querySelectorAll('.search-suggestion-item').forEach(item => {
        item.addEventListener('mousedown', (e) => { e.preventDefault(); selectSuggestion(item); });
    });
}

async function init() {
    if (DEBUG) renderDebug();
    applyTranslations();
    updateTime();
    setInterval(updateTime, 10000);
    setInterval(fetchWeather, 10 * 60 * 1000);
    updateBuienradar();
    window.addEventListener('resize', scaleBuienradar);

    // Weather report toggle (lees meer / lees minder)
    const openReportDetails = () => {
        const details = document.getElementById('weather-report-details');
        const openBtn = document.getElementById('weather-report-toggle-open');
        if (!details) return;
        details.classList.add('expanded');
        if (openBtn) openBtn.classList.add('hidden');
    };
    const closeReportDetails = () => {
        const details = document.getElementById('weather-report-details');
        const openBtn = document.getElementById('weather-report-toggle-open');
        if (!details) return;
        details.classList.remove('expanded');
        if (openBtn) openBtn.classList.remove('hidden');
    };
    document.getElementById('weather-report-toggle-open')?.addEventListener('click', openReportDetails);
    document.getElementById('weather-report-toggle')?.addEventListener('click', closeReportDetails);

    // Metric expand panels (accordion)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.metric-expand-btn');
        if (btn?.dataset.metric) toggleMetricPanel(btn.dataset.metric);
    });

    // Swipe left/right on expand area to cycle through metrics
    let swipeTouchStartX = 0;
    const expandArea = document.getElementById('metric-expand-area');
    expandArea?.addEventListener('touchstart', e => {
        swipeTouchStartX = e.touches[0].clientX;
    }, { passive: true });
    expandArea?.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - swipeTouchStartX;
        if (Math.abs(dx) < 48 || !activeMetric) return;
        const metrics = [...document.querySelectorAll('.metric-item[data-metric]')].map(el => el.dataset.metric);
        const idx = metrics.indexOf(activeMetric);
        const next = dx < 0
            ? metrics[(idx + 1) % metrics.length]
            : metrics[(idx - 1 + metrics.length) % metrics.length];
        toggleMetricPanel(next);
    }, { passive: true });

    // AQI overlay (kept for backwards compat)
    document.getElementById('aqi-overlay-close')?.addEventListener('click', closeAQIOverlay);
    document.getElementById('aqi-overlay-backdrop')?.addEventListener('click', closeAQIOverlay);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (state._lastHourly) {
            renderChart(state._lastHourly, state._lastMinutely15);
            renderUVChart(state._lastHourly, state._lastDaily);
        }
    });

    document.getElementById('lang-select')?.addEventListener('change', (e) => {
        state.lang = e.target.value;
        reloadWithLanguage(state.lang);
    });

    state.lat = CONFIG.DEFAULT_LAT;
    state.lon = CONFIG.DEFAULT_LON;
    state.city = CONFIG.DEFAULT_CITY;
    if (els.cityName) els.cityName.innerText = CONFIG.DEFAULT_CITY;
    if (DEBUG) { state._debug.geoSource = 'default Amsterdam'; renderDebug(); }

    window.addEventListener('popstate', () => {
        loadLocationFromUrl().then(ok => { if (ok) fetchWeather(); });
    });

    const urlOk = await loadLocationFromUrl();
    if (urlOk) {
        fetchWeather();
    } else {
        fetchWeather();

        // Laad laatste handmatige locatie als die er is; GPS overschrijft indien toegestaan.
        const lastLoc = loadLastLocation();
        if (lastLoc) {
            state.lat = lastLoc.lat;
            state.lon = lastLoc.lon;
            state.city = lastLoc.city;
            if (els.cityName) els.cityName.innerText = lastLoc.city;
            if (DEBUG) { state._debug.geoSource = 'localStorage'; renderDebug(); }
            fetchWeather();
        }

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
                }
            );
        } else {
            if (DEBUG) { state._debug.geoSource = 'default (geen geo-API)'; renderDebug(); }
        }
    }

    if (DEBUG) renderDebug();

    const debouncedSuggest = debounce(async (query) => {
        const results = await fetchSuggestions(query);
        showSuggestions(results);
    }, 280);

    els.citySearch.addEventListener('focus', () => {
        if (!els.citySearch.value.trim()) showRecentSuggestions();
    });

    els.citySearch.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        if (q.length === 0) { showRecentSuggestions(); return; }
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
    scaleBuienradar();
}

function degreesToCompass(deg) {
    const dirs = ['N','NNO','NO','ONO','O','OZO','ZO','ZZO','Z','ZZW','ZW','WZW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
}

function toggleMetricPanel(key) {
    const panelId = `metric-panel-${key}`;

    const hero = document.getElementById('weather-hero');
    const collapseAll = () => {
        document.querySelectorAll('.metric-panel').forEach(p => p.classList.remove('expanded'));
        document.querySelectorAll('.metric-expand-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.metric-item[data-metric], .hero-left[data-metric]').forEach(el => el.classList.remove('metric-active'));
        hero?.classList.remove('hero-expanded');
    };

    if (activeMetric === key) {
        collapseAll();
        activeMetric = null;
        return;
    }

    collapseAll();
    activeMetric = key;

    document.getElementById(panelId)?.classList.add('expanded');
    document.querySelectorAll(`.metric-expand-btn[data-metric="${key}"]`).forEach(b => b.classList.add('active'));
    document.querySelectorAll(`.metric-item[data-metric="${key}"], .hero-left[data-metric="${key}"]`).forEach(el => el.classList.add('metric-active'));
    hero?.classList.add('hero-expanded');

    // Wait for CSS transition (350ms) before re-rendering charts
    setTimeout(() => {
        if (key === 'temp' && state._lastHourly) renderChart(state._lastHourly, state._lastMinutely15);
        if (key === 'uv' && state._lastHourly) renderUVChart(state._lastHourly, state._lastDaily);
        if (key === 'wind') renderWindPanel();
    }, 360);
}

function buildBftGauge(bft) {
    const r = 40, cx = 50, cy = 52;
    const startX = cx - r, endX = cx + r;
    const angle = (1 - Math.min(bft, 12) / 12) * Math.PI;
    const curX = cx + r * Math.cos(angle);
    const curY = cy - r * Math.sin(angle);
    const largeArc = bft > 6 ? 1 : 0;
    const nr = 28;
    const nx = cx + nr * Math.cos(angle);
    const ny = cy - nr * Math.sin(angle);
    const colors = [WARN.green,WARN.green,WARN.green,WARN.green,WARN.yellow,WARN.yellow,WARN.orange,WARN.orange,WARN.red,WARN.red,WARN.red,WARN.red,WARN.red];
    const fill = colors[Math.min(bft, 12)];
    return `<svg viewBox="0 0 100 60" class="bft-gauge-svg" aria-hidden="true">
      <path d="M${startX} ${cy} A${r} ${r} 0 0 1 ${endX} ${cy}" fill="none" stroke="var(--border-soft,#e5e7eb)" stroke-width="7" stroke-linecap="round"/>
      ${bft > 0 ? `<path d="M${startX} ${cy} A${r} ${r} 0 ${largeArc} 1 ${curX.toFixed(1)} ${curY.toFixed(1)}" fill="none" stroke="${fill}" stroke-width="7" stroke-linecap="round"/>` : ''}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="3.5" fill="currentColor"/>
      <text x="${startX - 1}" y="${cy + 11}" font-size="7" fill="currentColor" opacity="0.45" text-anchor="middle">1</text>
      <text x="${cx}" y="8" font-size="7" fill="currentColor" opacity="0.45" text-anchor="middle">6</text>
      <text x="${endX + 1}" y="${cy + 11}" font-size="7" fill="currentColor" opacity="0.45" text-anchor="middle">12</text>
    </svg>`;
}

function renderWindPanel() {
    const el = document.getElementById('wind-detail-content');
    const data = state._lastCurrent;
    const hourly = state._lastHourly;
    if (!el || !data) return;

    const bft = getBeaufort(data.wind_speed_10m);
    const kmh = Math.round(data.wind_speed_10m);
    const dir = degreesToCompass(data.wind_direction_10m);
    const deg = data.wind_direction_10m;
    const hourIdx = locationHour();
    const gust = hourly?.wind_gusts_10m?.[hourIdx];
    const gustKmh = gust ? Math.round(gust) : null;
    const gustBft = gustKmh ? getBeaufort(gustKmh) : null;

    el.innerHTML = `
        <div class="wind-panel-top">
            <div class="wind-gauge-col">
                <div class="wind-gauge-inner">
                    ${buildBftGauge(bft)}
                    <div class="wind-bft-label"><strong>${bft}</strong> Bft</div>
                </div>
                <div class="wind-compass-col">
                    <i data-lucide="navigation" class="wind-nav-icon" style="transform:rotate(${deg}deg)"></i>
                    <span class="wind-dir-text">${dir}</span>
                </div>
            </div>
            <div class="wind-stats-col">
                <div class="wind-big-stat">
                    <span class="wind-big-val">${kmh}</span>
                    <span class="wind-big-unit">km/u</span>
                </div>
                ${gustKmh ? `<div class="wind-gust-row"><span class="wind-gust-label">Windstoten</span><span class="wind-gust-val">${gustKmh} km/u · ${gustBft} Bft</span></div>` : ''}
            </div>
        </div>
        <div class="wind-chart-wrap">
            <div id="wind-speed-chart"></div>
        </div>
    `;
    if (window.lucide) lucide.createIcons();
    if (hourly?.wind_speed_10m) renderWindSpeedChart(hourly);
}

function renderWindSpeedChart(hourly) {
    const el = document.getElementById('wind-speed-chart');
    if (!el) return;
    const today = locationISO().substring(0, 10);
    let startIdx = hourly.time.findIndex(t => t.startsWith(today));
    if (startIdx === -1) startIdx = 0;
    startIdx += locationHour();

    const labels = [], speeds = [], gusts = [];
    for (let i = 0; i < 25 && startIdx + i < hourly.time.length; i++) {
        const idx = startIdx + i;
        labels.push(hourly.time[idx].substring(11, 16));
        speeds.push(getBeaufort(hourly.wind_speed_10m?.[idx] ?? 0));
        if (hourly.wind_gusts_10m) gusts.push(getBeaufort(hourly.wind_gusts_10m[idx] ?? 0));
    }

    if (state.windChart) { state.windChart.destroy(); state.windChart = null; }
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = chartTheme();

    const hasGusts = gusts.length > 0;
    const gustLineColor = dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
    const gustMarkers = gusts.map((bft, i) => ({ seriesIndex: 1, dataPointIndex: i, fillColor: getWindDotColor(bft), strokeColor: getWindDotColor(bft), size: 4 }));

    const series = [
        { name: 'Wind (Bft)', type: 'bar', data: speeds.map((v, i) => ({ x: labels[i], y: v, fillColor: getWindDotColor(v) })) },
        ...(hasGusts ? [{ name: 'Windstoten (Bft)', type: 'line', data: gusts.map((v, i) => ({ x: labels[i], y: v })) }] : []),
    ];

    const yMax = Math.max(...speeds, ...gusts, 3) + 1;

    state.windChart = new ApexCharts(el, {
        series,
        chart: { type: 'bar', height: 220, background: 'transparent', toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' },
        theme: { mode: dark ? 'dark' : 'light' },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: [0, 2] },
        colors: ['#3b82f6', gustLineColor],
        plotOptions: { bar: { borderRadius: 2, columnWidth: '60%' } },
        fill: { opacity: [0.85, 1] },
        markers: { size: [0, 4], discrete: gustMarkers },
        xaxis: { type: 'category', tickAmount: 6, labels: { style: { fontSize: '10px', colors: theme.labelColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { min: 0, max: yMax, tickAmount: 4, labels: { style: { fontSize: '10px', colors: theme.labelColor }, formatter: v => Number.isInteger(v) ? `${v} Bft` : '' } },
        grid: { borderColor: theme.gridColor, strokeDashArray: 3 },
        legend: { show: false },
        tooltip: { y: { formatter: v => `${v} Bft` } },
    });
    state.windChart.render();
}

function scaleBuienradar() {
    const container = document.querySelector('.buienradar-container');
    const frame = document.getElementById('buienradar-frame');
    if (!container || !frame) return;
    const containerW = container.clientWidth;
    if (!containerW) return;
    const NATIVE_W = 600;
    const NATIVE_H = 500;
    const scale = containerW / NATIVE_W;
    frame.style.width = NATIVE_W + 'px';
    frame.style.height = NATIVE_H + 'px';
    frame.style.left = '50%';
    frame.style.marginLeft = `-${NATIVE_W / 2}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.transformOrigin = 'top center';
    container.style.height = Math.round(NATIVE_H * scale) + 'px';
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
            const countryCodeSearch = (loc.country_code || '').toUpperCase();
            saveLastLocation();
            saveRecentLocation({ lat: state.lat, lon: state.lon, city: state.city, countryCode: countryCodeSearch });
            updateUrlForLocation(loc.name, countryCodeSearch);
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
        const countryCode = (data.address.country_code || '').toUpperCase();
        els.cityName.innerText = state.city;
        updateBuienradar();
        saveLastLocation();
        saveRecentLocation({ lat: state.lat, lon: state.lon, city: state.city, countryCode });
        updateUrlForLocation(state.city, countryCode);
    } catch (err) {
        els.cityName.innerText = t('geocode_unknown');
    }
}

async function fetchWeather() {
    const requestId = ++state.weatherRequestId;
    const requestLocation = { lat: state.lat, lon: state.lon, city: state.city };
    const params = new URLSearchParams({
        latitude: requestLocation.lat,
        longitude: requestLocation.lon,
        current: ['temperature_2m', 'apparent_temperature', 'is_day', 'weather_code', 'wind_speed_10m', 'wind_direction_10m'],
        hourly: ['temperature_2m', 'weather_code', 'dew_point_2m', 'precipitation', 'uv_index', 'wind_speed_10m', 'wind_gusts_10m'],
        minutely_15: ['precipitation'],
        daily: ['sunrise', 'sunset'],
        timezone: 'auto',
        forecast_days: 2
    });

    try {
        const res = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
        const data = await res.json();
        if (requestId < state.renderedWeatherRequestId) return;
        state.renderedWeatherRequestId = requestId;
        state.lat = requestLocation.lat;
        state.lon = requestLocation.lon;
        state.city = requestLocation.city;
        if (els.cityName) els.cityName.innerText = requestLocation.city;
        updateUI(data);
    } catch (err) {
        console.error("Weer ophalen mislukt:", err);
    }
}

function getWindDotColor(bft) {
    if (bft <= 3) return WARN.green;
    if (bft <= 5) return WARN.yellow;
    if (bft <= 7) return WARN.orange;
    return WARN.red;
}

function getDewpointColor(dp) {
    if (dp <= 10) return WARN.green;
    if (dp <= 15) return WARN.yellow;
    if (dp <= 18) return WARN.orange;
    return WARN.red;
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

    const tempEl = els.currentTemp;
    const tempVal = Math.round(current.temperature_2m);
    const feelsVal = Math.round(current.apparent_temperature);
    tempEl.classList.remove('temp-loading', 'temp-loaded');
    void tempEl.offsetWidth; // reflow to restart animation
    tempEl.classList.add('temp-loaded');
    tempEl.innerText = `${tempVal}°`;

    const feelsEl = document.getElementById('feels-like-temp');
    if (feelsEl) {
        if (feelsVal !== tempVal) {
            feelsEl.textContent = t('label_feels_like_short', { temp: feelsVal });
            feelsEl.hidden = false;
        } else {
            feelsEl.hidden = true;
        }
    }

    const bft = getBeaufort(current.wind_speed_10m);
    if (els.windForce) els.windForce.innerText = `${bft} Bft`;
    if (els.windDot) els.windDot.style.background = getWindDotColor(bft);
    if (els.windArrow) {
        els.windArrow.style.transform = `rotate(${current.wind_direction_10m}deg)`;
    }

    // Show location-specific sections based on country
    const buienradarSection = document.getElementById('buienradar-section');
    if (buienradarSection) {
        buienradarSection.classList.toggle('hidden', !isInNetherlands());
        if (isInNetherlands()) requestAnimationFrame(scaleBuienradar);
    }
    const weatherReportCard = document.getElementById('weather-report-card');
    if (weatherReportCard) weatherReportCard.classList.toggle('hidden', !isInNetherlands());

    const germanySection = document.getElementById('germany-section');
    if (germanySection) germanySection.classList.toggle('hidden', !isInGermany());

    state._lastCurrent = current;

    const hourIdx = locationHour();
    const dp = data.hourly.dew_point_2m[hourIdx];
    if (els.dewPoint) els.dewPoint.innerText = `${Math.round(dp)}°`;
    if (els.dewDot) els.dewDot.style.background = getDewpointColor(dp);

    if (els.weatherIcon) {
        els.weatherIcon.src = getMeteoconSrc(current.weather_code, current.is_day);
        els.weatherIcon.alt = getWeatherDesc(current.weather_code);
    }
    if (window.lucide) lucide.createIcons();

    const currentUV = data.hourly.uv_index?.[hourIdx] ?? 0;
    state._lastHourly = data.hourly;
    state._lastMinutely15 = data.minutely_15;
    state._lastDaily = data.daily;
    const forecastDewpointStatus = dewpointRunStatus(maxFinite(collectVisibleDewpoints(data.hourly, data.minutely_15)));
    updateComfortLevel(dp, current.temperature_2m, forecastDewpointStatus);
    generateRecommendation(current, dp, currentUV, forecastDewpointStatus);
    renderChart(data.hourly, data.minutely_15);
    renderUVChart(data.hourly, data.daily);
    if (DEBUG) {
        state._debug.temp = Math.round(current.temperature_2m);
        state._debug.feelsLike = Math.round(current.apparent_temperature);
        state._debug.wind = bft;
        state._debug.dewPoint = Math.round(dp);
        state._debug.weatherCode = current.weather_code;
        state._debug.countryMode = isInGermany() ? 'DE' : isInNetherlands() ? 'NL' : 'other';
        renderDebug();
    }
    fetchWeatherAlerts().then(renderAlerts);
    if (isInGermany()) {
        fetchAQI_DE();
        fetchWeatherReportDE();
        updateRainViewerMap();
    } else {
        fetchAQI();
    }
    if (isInNetherlands()) {
        fetchBuienradarRain();
        fetchWeatherReport();
    }
}

function updateComfortLevel(dewPoint, temp, forecastDewpointStatus = null) {
    const tempF = (temp * 9 / 5) + 32;
    const dpF = (dewPoint * 9 / 5) + 32;
    const sum = tempF + dpF;

    if (!els.comfortContainer) return;
    let level = "";
    let cssClass = "";

    if (forecastDewpointStatus?.level === 'red') {
        level = t('comfort_stop');     cssClass = "oppressive";
    } else if (forecastDewpointStatus?.level === 'orange') {
        level = t('comfort_tough');    cssClass = "uncomfortable";
    } else if (forecastDewpointStatus?.level === 'yellow') {
        level = t('comfort_sticky');   cssClass = "humid";
    } else if (sum <= 100) {
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
        els.comfortLevel.textContent = level;
    }
    els.comfortContainer.className = `hero-weather-title hidden`;
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
    if (temp > 22) {
        const dow = new Date().getDay(); // 0=Sunday, 6=Saturday
        items.push(dow === 0 || dow === 6 ? t('clothing_add_long_run') : t('clothing_add_waterfles'));
    }
    items.push(t('clothing_add_id'));
    return items;
}

function generateRecommendation(current, dewPoint, uvIndex = 0, forecastDewpointStatus = null) {
    const temp = current.temperature_2m;
    const feelsLike = current.apparent_temperature;
    const bft = getBeaufort(current.wind_speed_10m);
    const hour = locationHour();

    const issues = [];
    function flag(score, msg) { issues.push({ score, msg }); }

    const dp = Math.round(forecastDewpointStatus?.value ?? dewPoint);
    const fl = Math.round(feelsLike);
    const uv = uvIndex.toFixed(1);

    // Dew point: keep this aligned with the dew point graph warning levels.
    if (forecastDewpointStatus?.level === 'red') {
        flag(3, t('warn_dew_extreme', { temp: dp }));
    } else if (forecastDewpointStatus?.level === 'orange') {
        flag(2, t('warn_dew_high', { temp: dp }));
    } else if (forecastDewpointStatus?.level === 'yellow') {
        flag(1, t('warn_dew_moderate', { temp: dp }));
    }

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

    let badge, type;
    let warningsHTML = '';

    if (maxScore >= 3) {
        badge = t('rec_red');
        type = 'danger';
        const allIssues = [...redIssues, ...secondaryIssues];
        warningsHTML = allIssues.map(i => i.msg).join('<br>');
    } else if (maxScore === 2) {
        badge = t('rec_orange');
        type = 'caution';
        warningsHTML = issues.filter(i => i.score >= 2).map(i => i.msg).join('<br>');
    } else if (maxScore === 1) {
        badge = t('rec_yellow');
        type = 'warning';
        warningsHTML = issues.map(i => i.msg).join('<br>');
    } else {
        if (temp < 0)        badge = t('rec_green_freezing');
        else if (temp <= 7)  badge = t('rec_green_cold');
        else if (temp <= 22) badge = t('rec_green_mild');
        else                 badge = t('rec_green_warm');
        type = 'success';
    }

    if (els.recommendationBadge) {
        els.recommendationBadge.innerText = badge;
        els.recommendationBadge.className = `badge ${type}`;
    }
    if (els.clothingTip) els.clothingTip.innerHTML = clothingHTML;

    if (els.warnings) {
        if (warningsHTML) {
            els.warnings.innerHTML = warningsHTML;
            els.warnings.classList.remove('hidden');
        } else {
            els.warnings.classList.add('hidden');
        }
    }
}

async function fetchBuienradarRain() {
    if (typeof ApexCharts === 'undefined' || !state.rainChart) return;
    const lat = state.lat.toFixed(2);
    const lon = state.lon.toFixed(2);
    try {
        const res = await fetch(
            `https://gadgets.buienradar.nl/data/raintext/?lat=${lat}&lon=${lon}`
        );
        if (!res.ok) {
            if (DEBUG) { state._debug.buienradarRain = `HTTP ${res.status} (Open-Meteo fallback)`; renderDebug(); }
            return;
        }
        const text = await res.text();
        const lines = text.trim().split('\n').filter(Boolean);
        if (lines.length < 5) {
            if (DEBUG) { state._debug.buienradarRain = `te weinig data (${lines.length} regels)`; renderDebug(); }
            return;
        }

        // Parse lines: "087|16:20"
        const parsed = [];
        for (const line of lines) {
            const parts = line.trim().split('|');
            if (parts.length !== 2) continue;
            const val = parseInt(parts[0], 10);
            const time = parts[1].trim();
            if (isNaN(val) || !time) continue;
            // Formula per Buienradar docs: Neerslagintensiteit = 10^((waarde-109)/32) in mm/u
            const mmPerHour = val === 0 ? 0 : Math.pow(10, (val - 109) / 32);
            parsed.push({ time, mmPerHour });
        }

        if (parsed.length < 5) {
            if (DEBUG) { state._debug.buienradarRain = 'parse mislukt'; renderDebug(); }
            return;
        }

        renderRainChartBuienradar(parsed);
        if (DEBUG) { state._debug.buienradarRain = `buienradar ok (${parsed.length} intervallen, 5-min)`; renderDebug(); }
    } catch (e) {
        console.warn('Buienradar rain mislukt:', e.message);
        if (DEBUG) { state._debug.buienradarRain = 'fout: ' + e.message + ' (Open-Meteo fallback)'; renderDebug(); }
    }
}

async function fetchWeatherReport() {
    const card = document.getElementById('weather-report-card');
    if (!card) return;
    try {
        const res = await fetch('https://data.buienradar.nl/2.0/feed/json');
        if (!res.ok) return;
        const json = await res.json();
        const forecast = json?.forecast;
        if (!forecast) return;

        const wr = forecast.weatherreport;
        const shortterm = forecast.shortterm;
        const longterm = forecast.longterm;
        if (!wr) return;

        const decodeHtml = s => {
            const tmp = document.createElement('div');
            tmp.innerHTML = s.replace(/<[^>]+>/g, ' ');
            return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
        };

        // Format published time relative to today
        const formatPublishedTime = iso => {
            if (!iso) return '';
            const [datePart, timePart] = iso.split('T');
            const [y, m, d] = datePart.split('-').map(Number);
            const time = timePart ? timePart.substring(0, 5) : '';
            const todayAtLoc = new Date(Date.now() + state.utcOffsetSeconds * 1000);
            const todayY = todayAtLoc.getUTCFullYear();
            const todayM = todayAtLoc.getUTCMonth() + 1;
            const todayD = todayAtLoc.getUTCDate();
            if (y === todayY && m === todayM && d === todayD) return time;
            const pubDate = new Date(y, m - 1, d);
            const todayDate = new Date(todayY, todayM - 1, todayD);
            const diffDays = Math.round((todayDate - pubDate) / 86400000);
            if (diffDays === 1) return `Gisteren ${time}`;
            if (diffDays === 2) return `Eergisteren ${time}`;
            const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
            return `${d} ${months[m - 1]}`;
        };

        const formatDateRange = (start, end) => {
            const months = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
            const s = start.split('T')[0].split('-').map(Number);
            const e = end.split('T')[0].split('-').map(Number);
            return `${s[2]} ${months[s[1]-1]} – ${e[2]} ${months[e[1]-1]}`;
        };

        // Extract raw Dutch texts
        const rawTitle    = wr.title || '';
        const rawSummary  = decodeHtml(wr.summary || '');
        const stripPrefix = (text, prefix) => {
            const t = text.trim(), p = prefix.trim();
            if (!p || !t.toLowerCase().startsWith(p.toLowerCase())) return t;
            return t.slice(p.length).replace(/^[\s.:\-–]+/, '').trim();
        };
        const rawBodyFull = decodeHtml(wr.text || '');
        const rawBody     = stripPrefix(stripPrefix(rawBodyFull, rawTitle), rawSummary);
        const rawShort    = shortterm?.forecast || '';
        const rawLong     = longterm?.forecast || '';
        const timeStr     = formatPublishedTime(wr.published || '');
        const shortRange  = shortterm?.startdate && shortterm?.enddate ? `${formatDateRange(shortterm.startdate, shortterm.enddate)}: ` : '';
        const longRange   = longterm?.startdate && longterm?.enddate   ? `${formatDateRange(longterm.startdate, longterm.enddate)}: `   : '';

        const renderTexts = (f) => {
            const summaryEl = document.getElementById('weather-report-summary');
            if (summaryEl) {
                summaryEl.innerHTML = escHtml(f.summary)
                    + (timeStr ? ` <span class="weather-report-time">${escHtml(timeStr)}</span>` : '');
            }
            const reportTitleEl = document.getElementById('weather-report-title');
            if (reportTitleEl && f.title) {
                reportTitleEl.innerHTML = escHtml(f.title);
                reportTitleEl.classList.remove('hidden');
            }
            const textEl = document.getElementById('weather-report-text');
            if (textEl) textEl.textContent = f.body.replace(/([.!?])\s+(Morgen|morgen|Tomorrow|tomorrow|Demain|demain|Mañana|mañana|Imorgon|imorgon)/g, '$1\n\n$2');
            const shorttermEl = document.getElementById('weather-shortterm');
            if (shorttermEl && f.shortterm) shorttermEl.textContent = shortRange + f.shortterm;
            const longtermEl = document.getElementById('weather-longterm');
            if (longtermEl && f.longterm) longtermEl.textContent = longRange + f.longterm;
        };

        // Show Dutch immediately, then replace with translation if needed
        renderTexts({ title: rawTitle, summary: rawSummary, body: rawBody, shortterm: rawShort, longterm: rawLong });
        card.classList.remove('hidden');

        if (state.lang !== 'nl') {
            translateReport({ title: rawTitle, summary: rawSummary, body: rawBody, shortterm: rawShort, longterm: rawLong }, state.lang)
                .then(renderTexts)
                .catch(() => {});
        }
    } catch (e) {
        console.warn('fetchWeatherReport mislukt:', e.message);
    }
}

function renderRainChartBuienradar(parsed) {
    if (!state.rainChart) return;
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const apexTheme = { mode: dark ? 'dark' : 'light' };
    const apexGrid = {
        borderColor: cssVar('--chart-grid') || (dark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.07)'),
        xaxis: { lines: { show: true } }
    };

    const labels = parsed.map(d => {
        const [hStr, mStr] = d.time.split(':');
        const h = parseInt(hStr, 10), m = parseInt(mStr, 10);
        // Show label only on each full hour
        return m === 0 ? d.time : '';
    });
    const data  = parsed.map(d => Math.max(0, d.mmPerHour));
    const times = parsed.map(d => d.time);

    const xFormatter = (_, opts) => times[opts?.dataPointIndex] ?? '';

    state.rainChart.destroy();
    const rainEl = document.getElementById('rain-chart');
    if (!rainEl) return;

    // Scale y to data, minimum ceiling of 2 mm/u so empty charts look right
    const dataMax = Math.max(...data);
    const rainPreviewEl = document.getElementById('rain-preview');
    if (dataMax <= 0) {
        if (rainPreviewEl) rainPreviewEl.classList.add('hidden');
        return;
    }
    if (rainPreviewEl) rainPreviewEl.classList.remove('hidden');
    const yMax = Math.max(dataMax * 1.15, 2);

    state.rainChart = new ApexCharts(rainEl, {
        chart: {
            toolbar: { show: false },
            zoom: { enabled: false },
            animations: { enabled: false },
            background: 'transparent',
            fontFamily: 'Inter, sans-serif',
            type: 'bar',
            height: '100%'
        },
        theme: apexTheme,
        series: [{ name: 'mm/u', data }],
        xaxis: {
            categories: labels,
            labels: { rotate: 0, style: { fontSize: '11px' }, hideOverlappingLabels: false },
            axisTicks: { show: false },
            tooltip: { enabled: false }
        },
        yaxis: {
            min: 0, max: yMax,
            tickAmount: 3,
            labels: { formatter: v => v.toFixed(1), style: { fontSize: '11px' } }
        },
        title: {
            text: t('legend_rain'),
            align: 'left',
            style: { fontSize: '12px', fontWeight: '600', fontFamily: 'Inter, sans-serif', color: cssVar('--chart-tick') || '#666' }
        },
        colors: [cssVar('--rain') || '#1a73e8'],
        plotOptions: { bar: { columnWidth: '90%', borderRadius: 1, minHeight: 2 } },
        dataLabels: { enabled: false },
        legend: { show: false },
        tooltip: {
            shared: true, intersect: false,
            x: { formatter: xFormatter },
            y: { formatter: v => v.toFixed(1) + ' mm/u' }
        },
        grid: apexGrid
    });
    state.rainChart.render();
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

function maxFinite(values) {
    const finite = values.filter(Number.isFinite);
    return finite.length ? Math.max(...finite) : NaN;
}

function dewpointRunStatus(dewpoint) {
    if (!Number.isFinite(dewpoint) || dewpoint < 18) return null;
    if (dewpoint < 22) return { level: 'yellow', value: dewpoint, text: t('dewpoint_advice_yellow') };
    if (dewpoint <= 28) return { level: 'orange', value: dewpoint, text: t('dewpoint_advice_orange') };
    return { level: 'red', value: dewpoint, text: t('dewpoint_advice_red') };
}

function collectVisibleDewpoints(hourly, minutely15) {
    const nowISO = locationISO().substring(0, 14) + '00';
    const dewpoints = [];

    if (minutely15?.time?.length) {
        let m15Start = minutely15.time.findIndex(t => t >= nowISO);
        if (m15Start === -1) m15Start = 0;
        let lastHourDewpoint = null;
        for (let i = 0; i < 24; i++) {
            const idx = m15Start + i * 2;
            if (idx >= minutely15.time.length) break;
            const ts = minutely15.time[idx];
            if (ts.substring(14, 16) === '00') {
                const hIdx = hourly.time.findIndex(t => t.startsWith(ts.substring(0, 13)));
                lastHourDewpoint = hIdx !== -1 ? (hourly.dew_point_2m?.[hIdx] ?? null) : null;
            }
            dewpoints.push(lastHourDewpoint);
        }
        return dewpoints;
    }

    let startIndex = hourly.time.findIndex(t => t >= nowISO);
    if (startIndex === -1) startIndex = 0;
    for (let i = startIndex; i < startIndex + 12; i++) {
        if (hourly.temperature_2m[i] === undefined) break;
        dewpoints.push(hourly.dew_point_2m?.[i] ?? null);
    }
    return dewpoints;
}

function renderDewpointStatus(dewpoints) {
    const statusEl = document.getElementById('dewpoint-status');
    const textEl = document.getElementById('dewpoint-status-text');
    if (!statusEl || !textEl) return;

    const maxDewpoint = maxFinite(dewpoints);
    const status = dewpointRunStatus(maxDewpoint);
    if (!status) {
        statusEl.className = 'dewpoint-status hidden';
        textEl.textContent = '';
        return;
    }

    statusEl.className = `dewpoint-status dewpoint-status-${status.level}`;
    textEl.textContent = status.text;
}

function renderChart(hourly, minutely15) {
    const nowISO = locationISO().substring(0, 14) + '00';
    const labels = [], temps = [], rain = [], dewpoints = [], timestamps = [];

    if (minutely15?.time?.length) {
        let m15Start = minutely15.time.findIndex(t => t >= nowISO);
        if (m15Start === -1) m15Start = 0;
        let lastHourTemp = null, lastHourDewpoint = null;
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
                lastHourTemp     = hIdx !== -1 ? hourly.temperature_2m[hIdx] : null;
                lastHourDewpoint = hIdx !== -1 ? (hourly.dew_point_2m?.[hIdx] ?? null) : null;
            }
            temps.push(lastHourTemp);
            dewpoints.push(lastHourDewpoint);
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
            dewpoints.push(hourly.dew_point_2m?.[i] ?? null);
        }
    }

    if (typeof ApexCharts === 'undefined') {
        renderDewpointStatus(dewpoints);
        return;
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
            title: {
                text: t('legend_temp'),
                align: 'left',
                style: { fontSize: '12px', fontWeight: '600', fontFamily: 'Inter, sans-serif', color: cssVar('--chart-tick') || '#666' }
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
        const hasRain = rain.some(v => v > 0);
        const rainPreview = document.getElementById('rain-preview');
        if (rainPreview) {
            if (hasRain) rainPreview.classList.remove('hidden');
            else rainPreview.classList.add('hidden');
        }
        state.rainChart = new ApexCharts(rainEl, {
            chart: { ...apexBase, type: 'bar', height: '100%' },
            theme: apexTheme,
            series: [{ name: 'mm', data: rain }],
            xaxis: { ...apexXaxis },
            yaxis: {
                min: 0, max: 3, tickAmount: 3,
                labels: { formatter: v => v, style: { fontSize: '11px' } }
            },
            title: {
                text: t('legend_rain'),
                align: 'left',
                style: { fontSize: '12px', fontWeight: '600', fontFamily: 'Inter, sans-serif', color: cssVar('--chart-tick') || '#666' }
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

    // Dauwpunt
    if (state.dewpointChart) { state.dewpointChart.destroy(); state.dewpointChart = null; }
    const dewpointEl = document.getElementById('dewpoint-chart');
    if (dewpointEl) {
        state.dewpointChart = new ApexCharts(dewpointEl, {
            chart: { ...apexBase, type: 'area', height: '100%' },
            theme: apexTheme,
            series: [{ name: '°C', data: dewpoints }],
            xaxis: { ...apexXaxis },
            yaxis: {
                labels: { formatter: v => Math.round(v) + '°', style: { fontSize: '11px' } },
                tickAmount: 4
            },
            title: {
                text: t('legend_dewpoint'),
                align: 'left',
                style: { fontSize: '12px', fontWeight: '600', fontFamily: 'Inter, sans-serif', color: cssVar('--chart-tick') || '#666' }
            },
            colors: [cssVar('--dewpoint') || '#6d28d9'],
            fill: { type: 'gradient', gradient: { opacityFrom: 0.15, opacityTo: 0.02 } },
            stroke: { curve: 'smooth', width: 2 },
            dataLabels: { enabled: false },
            legend: { show: false },
            markers: { size: 0 },
            tooltip: {
                shared: true, intersect: false,
                x: { formatter: xFormatter },
                y: { formatter: v => Math.round(v) + '°C' }
            },
            grid: apexGrid
        });
        state.dewpointChart.render();
    }

    renderDewpointStatus(dewpoints);
}

// ---- UV / Zonkracht ----

const UV_ZONES = [
    { min: 0,   max: 2.5,      color: WARN.green  },
    { min: 2.5, max: 4.5,      color: WARN.yellow },
    { min: 4.5, max: 6.5,      color: WARN.orange },
    { min: 6.5, max: Infinity, color: WARN.red    }
];

function uvZoneColor(v) {
    if (v < 2.5) return WARN.green;
    if (v < 4.5) return WARN.yellow;
    if (v < 6.5) return WARN.orange;
    return WARN.red;
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
        `<b>Dauw</b>: ${d.dewPoint ?? '–'}°C | <b>WC</b>: ${d.weatherCode ?? '–'}`,
        `<b>Buienradar regen</b>: ${d.buienradarRain}`,
        `<b>Country mode</b>: ${d.countryMode ?? '–'} | germany-section: ${document.getElementById('germany-section') ? 'aanwezig' : 'ONTBREEKT in DOM'}`
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

function getPollutantColor(name, val) {
    if (val === null || val === undefined) return WARN.none;
    const thresholds = {
        pm25: [10, 20, 25, 50],
        pm10: [20, 40, 50, 100],
        no2:  [40, 90, 120, 230],
        o3:   [50, 100, 130, 240],
    };
    const t = thresholds[name];
    if (!t) return WARN.none;
    if (val <= t[0]) return WARN.green;
    if (val <= t[1]) return WARN.yellow;
    if (val <= t[2]) return WARN.yellow;
    if (val <= t[3]) return WARN.orange;
    return WARN.red;
}

function getAQILevel(aqi) {
    if (aqi <= 20) return { label: t('aqi_good'),          color: WARN.green,  cls: 'aqi-good',      tipKey: 'good' };
    if (aqi <= 40) return { label: t('aqi_fair'),          color: WARN.yellow, cls: 'aqi-fair',      tipKey: 'fair' };
    if (aqi <= 60) return { label: t('aqi_moderate'),      color: WARN.yellow, cls: 'aqi-moderate',  tipKey: 'moderate' };
    if (aqi <= 80) return { label: t('aqi_poor'),          color: WARN.orange, cls: 'aqi-poor',      tipKey: 'poor' };
    if (aqi <= 100) return { label: t('aqi_very_poor'),    color: WARN.red,    cls: 'aqi-very-poor', tipKey: 'very_poor' };
    return               { label: t('aqi_extremely_poor'), color: WARN.red,    cls: 'aqi-extreme',   tipKey: 'extreme' };
}

function openAQIOverlay() {
    els.aqiOverlay?.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (window.lucide) lucide.createIcons();
}

function closeAQIOverlay() {
    els.aqiOverlay?.classList.add('hidden');
    document.body.style.overflow = '';
}

async function fetchAQI() {
    const btn = document.getElementById('aqi-btn');
    const expandBtn = document.getElementById('aqi-expand-btn');
    if (!btn) return;
    try {
        const res = await fetch(
            `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${state.lat}&longitude=${state.lon}&current=european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone&timezone=auto`
        );
        const data = await res.json();
        const c = data.current;
        const aqi = c.european_aqi;
        if (aqi === undefined || aqi === null) return;

        const level = getAQILevel(aqi);
        const levelTextEl = document.getElementById('aqi-level-text');
        if (levelTextEl) levelTextEl.textContent = level.label;
        btn.style.setProperty('--aqi-color', level.color);
        btn.className = `aqi-metric-btn ${level.cls}`;
        btn.setAttribute('aria-label', `${t('aqi_label')}: ${level.label}`);
        btn.classList.remove('hidden');

        if (expandBtn) expandBtn.classList.remove('hidden');

        const pm25 = c.pm2_5?.toFixed(1) ?? '–';
        const pm10 = c.pm10?.toFixed(1) ?? '–';
        const no2  = c.nitrogen_dioxide?.toFixed(1) ?? '–';
        const o3   = c.ozone?.toFixed(1) ?? '–';

        const pollutantDot = (name, raw) => {
            const color = getPollutantColor(name, raw ?? null);
            return `<span class="aqi-pollutant-dot" style="background:${color}"></span>`;
        };

        const markerPct = Math.min(Math.max((aqi / 150) * 100, 2), 98);
        const aqiHtml = `
            <div class="aqi-full-panel">
                <div class="aqi-top-row">
                    <div class="aqi-number-group">
                        <span class="aqi-big-number" style="color:${level.color}">${aqi}</span>
                        <span class="aqi-big-unit">AQI</span>
                    </div>
                    <span class="aqi-overlay-level ${level.cls}">${escHtml(level.label)}</span>
                </div>
                <div class="aqi-bar-section">
                    <div class="aqi-bar-track">
                        <div class="aqi-bar-marker" style="left:${markerPct}%"></div>
                    </div>
                    <div class="aqi-bar-scale">
                        <span>0</span><span>40</span><span>60</span><span>80</span><span>100</span><span>150+</span>
                    </div>
                </div>
                <div class="aqi-pollutants-grid">
                    <div class="aqi-pollutant-card">${pollutantDot('pm25', c.pm2_5)}<span class="aqi-pollutant-name">PM2.5</span><span class="aqi-pollutant-val">${pm25}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card">${pollutantDot('pm10', c.pm10)}<span class="aqi-pollutant-name">PM10</span><span class="aqi-pollutant-val">${pm10}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card">${pollutantDot('no2', c.nitrogen_dioxide)}<span class="aqi-pollutant-name">NO₂</span><span class="aqi-pollutant-val">${no2}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card">${pollutantDot('o3', c.ozone)}<span class="aqi-pollutant-name">O₃</span><span class="aqi-pollutant-val">${o3}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                </div>
                <p class="aqi-panel-tip">${escHtml(t('aqi_tip_' + level.tipKey))}</p>
            </div>
        `;
        if (els.aqiOverlayBody) els.aqiOverlayBody.innerHTML = aqiHtml;
        if (els.aqiPanelBody) els.aqiPanelBody.innerHTML = aqiHtml;

        btn.onclick = () => toggleMetricPanel('aqi');
        // expandBtn uses the global .metric-expand-btn listener — don't double-wire
    } catch (e) {
        console.warn('AQI niet beschikbaar:', e);
    }
}

function getUVLevel(uv) {
    if (uv < 1)   return { label: t('uv_none'),     cls: 'uv-none',      color: '#9E9E9E', tip: '' };
    if (uv < 2.5) return { label: t('uv_low'),      cls: 'uv-low',       color: WARN.green,  tip: '' };
    if (uv < 4.5) return { label: t('uv_moderate'), cls: 'uv-moderate',  color: WARN.yellow, tip: t('uv_tip_moderate') };
    if (uv < 6.5) return { label: t('uv_high'),     cls: 'uv-high',      color: WARN.orange, tip: t('uv_tip_high') };
    return         { label: t('uv_very_high'),       cls: 'uv-very-high', color: WARN.red,    tip: t('uv_tip_very_high') };
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
    if (els.heroUV) els.heroUV.innerText = currentUVValue.toFixed(1);
    if (els.uvDot) els.uvDot.style.background = uvInfoCur.color;
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
            if (els.heroUV) {
                els.heroUV.innerText = curVal.toFixed(1);
                els.heroUV.title = t('rivm_measured');
            }
            const uvInfoRivm = getUVLevel(curVal);
            if (levelEl) { levelEl.innerText = uvInfoRivm.label; levelEl.className = `uv-badge ${uvInfoRivm.cls}${uvInfoRivm.cls === 'uv-none' ? ' hidden' : ''}`; }
            if (tipEl) tipEl.innerText = uvInfoRivm.tip;
            if (DEBUG) { state._debug.uvCurrent = curVal.toFixed(1); renderDebug(); }
        }

        drawUVChart(canvas, labels, sliceExpected, sliceMeasured);
    });
}

function drawUVChart(canvas, labels, predicted, measured) {
    if (typeof Chart === 'undefined') return;
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

// ============================================================
// GERMANY MODE
// ============================================================

// ── Stap 3: RainViewer radar ─────────────────────────────

let _rvMap = null;
let _rvLayers = [];
let _rvFrames = [];
let _rvIdx = 0;
let _rvTimer = null;
let _rvPaused = false;

function updateRainViewerMap() {
    if (typeof L === 'undefined') {
        console.warn('Leaflet niet geladen');
        return;
    }
    const mapEl = document.getElementById('rainviewer-map');
    if (!mapEl) return;

    // Wrap in rAF so the browser has re-laid out the (just un-hidden) section
    // before Leaflet measures the container.
    requestAnimationFrame(() => {
        if (!_rvMap) {
            _rvMap = L.map('rainviewer-map', { zoomControl: true, scrollWheelZoom: false });
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap',
                maxZoom: 18,
            }).addTo(_rvMap);

            const playBtn = document.getElementById('rainviewer-play');
            if (playBtn) {
                playBtn.addEventListener('click', () => {
                    _rvPaused = !_rvPaused;
                    playBtn.innerHTML = _rvPaused
                        ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
                        : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
                });
            }
        }

        _rvMap.setView([state.lat, state.lon], 8);
        _rvMap.invalidateSize();

        fetch('https://api.rainviewer.com/public/weather-maps.json')
            .then(r => r.json())
            .then(data => {
                const host = data.host;
                const past = data.radar?.past || [];
                const nowcast = data.radar?.nowcast || [];
                _rvFrames = [...past, ...nowcast];
                if (!_rvFrames.length) return;

                _rvLayers.forEach(l => _rvMap.removeLayer(l));
                _rvLayers = _rvFrames.map(frame =>
                    L.tileLayer(`${host}${frame.path}/512/{z}/{x}/{y}/2/1_1.png`, {
                        opacity: 0,
                        tileSize: 512,
                        zoomOffset: -1,
                        maxZoom: 18,
                        attribution: 'Weather data © RainViewer',
                    }).addTo(_rvMap)
                );

                clearInterval(_rvTimer);
                _rvIdx = _rvFrames.length - 1;
                _rvShowFrame(_rvIdx);

                _rvTimer = setInterval(() => {
                    if (_rvPaused) return;
                    _rvIdx = (_rvIdx + 1) % _rvFrames.length;
                    _rvShowFrame(_rvIdx);
                }, 500);
            })
            .catch(e => console.warn('RainViewer laden mislukt:', e));
    });
}

function _rvShowFrame(idx) {
    _rvLayers.forEach((l, i) => l.setOpacity(i === idx ? 0.65 : 0));
    const frame = _rvFrames[idx];
    if (!frame) return;
    const timeEl = document.getElementById('rainviewer-time');
    if (timeEl) {
        const d = new Date(frame.time * 1000);
        const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        // RainViewer: past frames have time <= now, nowcast frames are in the future
        const isNowcast = frame.time * 1000 > Date.now();
        timeEl.textContent = isNowcast ? `Nowcast ${label}` : label;
    }
}

// ── Stap 4: DWD tekstrapporten ───────────────────────────

const DWD_REGIONS = [
    { code: 'DWOG', name: 'Berlin',              lat: [52.33, 52.68], lon: [13.09, 13.77] },
    { code: 'DWHG', name: 'Hamburg',             lat: [53.39, 53.72], lon: [9.72,  10.33] },
    { code: 'DWPG', name: 'Sachsen',             lat: [50.17, 51.68], lon: [11.87, 15.04] },
    { code: 'DWEI', name: 'Thüringen',           lat: [50.20, 51.65], lon: [9.92,  12.65] },
    { code: 'DWEG', name: 'Brandenburg',         lat: [51.36, 53.56], lon: [11.27, 14.77] },
    { code: 'DWEH', name: 'Sachsen-Anhalt',      lat: [50.94, 53.04], lon: [10.56, 13.19] },
    { code: 'DWHH', name: 'Schleswig-Holstein',  lat: [53.36, 55.06], lon: [8.01,  11.00] },
    { code: 'DWLG', name: 'Niedersachsen',       lat: [51.29, 53.89], lon: [6.65,  11.60] },
    { code: 'DWLH', name: 'Nordrhein-Westfalen', lat: [50.32, 52.53], lon: [5.87,   9.46] },
    { code: 'DWLI', name: 'Hessen',              lat: [49.40, 51.66], lon: [7.77,  10.24] },
    { code: 'DWPH', name: 'Rheinland-Pfalz',     lat: [48.97, 50.94], lon: [6.11,   8.51] },
    { code: 'DWMO', name: 'Bayern',              lat: [47.27, 50.57], lon: [10.00, 13.84] },
    { code: 'DWMP', name: 'Baden-Württemberg',   lat: [47.53, 49.79], lon: [7.51,  10.50] },
];

function getDWDCode() {
    for (const r of DWD_REGIONS) {
        if (state.lat >= r.lat[0] && state.lat <= r.lat[1] &&
            state.lon >= r.lon[0] && state.lon <= r.lon[1]) return r.code;
    }
    return 'DWSG';
}

async function fetchWeatherReportDE() {
    const card = document.getElementById('dwd-report-card');
    const bodyEl = document.getElementById('dwd-report-body');
    if (!card || !bodyEl) return;

    const code = getDWDCode();
    const cacheKey = `hw_dwd_${code}`;
    const cacheTsKey = `hw_dwd_ts_${code}`;
    const TTL = 3 * 3600 * 1000;

    const cached = storageGet(cacheKey);
    const cachedTs = parseInt(storageGet(cacheTsKey) || '0', 10);
    if (cached && Date.now() - cachedTs < TTL) {
        await _renderDWDReport(cached, bodyEl, card);
        return;
    }

    try {
        const proxyRes = await fetch(`/api/dwd?code=${code}`);
        if (!proxyRes.ok) return;
        const text = await proxyRes.text();
        if (!text) return;
        storageSet(cacheKey, text);
        storageSet(cacheTsKey, String(Date.now()));
        await _renderDWDReport(text, bodyEl, card);
    } catch (e) {
        console.warn('DWD weerbericht mislukt:', e.message);
    }

    // Toggle logic (same as NL weather report)
    const openBtn = document.getElementById('dwd-report-toggle-open');
    const closeBtn = document.getElementById('dwd-report-toggle');
    const details = document.getElementById('dwd-report-details');
    if (openBtn && closeBtn && details) {
        openBtn.addEventListener('click', () => {
            details.classList.add('expanded');
            openBtn.classList.add('hidden');
        });
        closeBtn.addEventListener('click', () => {
            details.classList.remove('expanded');
            openBtn.classList.remove('hidden');
        });
    }
}

function _dwdTextToHtml(text) {
    return text.split('\n\n').map(block => {
        const b = block.trim();
        if (!b) return '';
        if (b.startsWith('**') && b.endsWith('**')) {
            return `<strong>${escHtml(b.slice(2, -2))}</strong>`;
        }
        return `<p>${escHtml(b)}</p>`;
    }).join('');
}

async function _renderDWDReport(text, bodyEl, card) {
    const displayText = text.trim();
    bodyEl.innerHTML = _dwdTextToHtml(displayText);
    card.classList.remove('hidden');

    if (state.lang !== 'de') {
        try {
            // Vertaal alleen de platte alinea's (geen **koppen**)
            const plainText = displayText.replace(/\*\*[^*]+\*\*/g, '').replace(/\n\n+/g, ' ').trim().substring(0, 900);
            const res = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(plainText)}&langpair=de|${state.lang}&de=olaflemmers@gmail.com`
            );
            const json = await res.json();
            const translated = json?.responseData?.translatedText;
            if (translated && translated.length > 50) {
                bodyEl.innerHTML = `<p>${escHtml(translated)}</p>`;
            }
        } catch { /* toon Duits als fallback */ }
    }
}

// ── Stap 5: UBA luchtkwaliteit ───────────────────────────

const UBA_BASE = 'https://www.umweltbundesamt.de/api/air_data/v2';
let _ubaStations = null;

async function _getUBAStations() {
    if (_ubaStations) return _ubaStations;
    const cacheKey = 'hw_uba_stations';
    const cacheTsKey = 'hw_uba_stations_ts';
    const cached = storageGet(cacheKey);
    const cachedTs = parseInt(storageGet(cacheTsKey) || '0', 10);
    if (cached && Date.now() - cachedTs < 24 * 3600 * 1000) {
        _ubaStations = JSON.parse(cached);
        return _ubaStations;
    }
    const res = await fetch(`${UBA_BASE}/stations/json?use=airquality&lang=de`);
    const data = await res.json();
    _ubaStations = Object.values(data.stations || {}).map(s => ({
        id: s[0],
        name: s[2],
        city: s[3],
        lon: parseFloat(s[7]),
        lat: parseFloat(s[8]),
    })).filter(s => !isNaN(s.lat) && !isNaN(s.lon));
    storageSet(cacheKey, JSON.stringify(_ubaStations));
    storageSet(cacheTsKey, String(Date.now()));
    return _ubaStations;
}

async function fetchAQI_DE() {
    const btn = document.getElementById('aqi-btn');
    if (!btn) return;
    try {
        const stations = await _getUBAStations();

        const nearest = stations.reduce((best, s) => {
            const d = Math.hypot(s.lat - state.lat, s.lon - state.lon);
            return d < best.d ? { s, d } : best;
        }, { s: null, d: Infinity }).s;
        if (!nearest) return;

        const now = new Date(Date.now() + (state.utcOffsetSeconds || 0) * 1000);
        const dateStr = now.toISOString().split('T')[0];
        const hour = Math.max(1, now.getUTCHours());

        const res = await fetch(
            `${UBA_BASE}/airquality/json?date_from=${dateStr}&time_from=1&date_to=${dateStr}&time_to=${hour}&station=${nearest.id}&lang=de`
        );
        const data = await res.json();
        const stationData = data.data?.[String(nearest.id)];
        if (!stationData) { fetchAQI(); return; }

        const times = Object.keys(stationData).sort();
        if (!times.length) { fetchAQI(); return; }
        const entry = stationData[times[times.length - 1]];

        // entry: [end_time, status, completeness, [comp_id, value, lqi_comp, y], ...]
        const comps = {};
        for (let i = 3; i < entry.length; i++) {
            const c = entry[i];
            if (Array.isArray(c) && c.length >= 3) comps[c[0]] = { value: c[1], idx: c[2] };
        }

        // UBA LQI 1–6: max of all component indices
        const lqi = Math.max(1, ...Object.values(comps).map(c => c.idx || 1));
        const pm10 = comps[1]?.value ?? null;
        const o3   = comps[3]?.value ?? null;
        const no2  = comps[5]?.value ?? null;
        const pm25 = comps[9]?.value ?? null;

        // Map UBA 1-6 to our 0–100 display scale for getAQILevel()
        const lqiScale = [0, 10, 30, 55, 75, 95, 150];
        const aqi100 = lqiScale[Math.min(lqi, 6)];
        const level = getAQILevel(aqi100);

        const levelTextEl = document.getElementById('aqi-level-text');
        if (levelTextEl) levelTextEl.textContent = level.label;
        btn.style.setProperty('--aqi-color', level.color);
        btn.className = `aqi-metric-btn ${level.cls}`;
        btn.setAttribute('aria-label', `${t('aqi_label')}: ${level.label}`);
        btn.classList.remove('hidden');

        const expandBtn = document.getElementById('aqi-expand-btn');
        if (expandBtn) expandBtn.classList.remove('hidden');

        const dot = (name, val) =>
            `<span class="aqi-pollutant-dot" style="background:${getPollutantColor(name, val)}"></span>`;
        const fmt = v => v != null ? v.toFixed(1) : '–';
        const markerPct = Math.min(Math.max(((lqi - 1) / 5) * 100, 2), 98);

        const aqiHtml = `
            <div class="aqi-full-panel">
                <div class="aqi-top-row">
                    <div class="aqi-number-group">
                        <span class="aqi-big-number" style="color:${level.color}">${lqi}</span>
                        <span class="aqi-big-unit">LQI</span>
                    </div>
                    <span class="aqi-overlay-level ${level.cls}">${escHtml(level.label)}</span>
                </div>
                <div class="aqi-bar-section">
                    <div class="aqi-bar-track">
                        <div class="aqi-bar-marker" style="left:${markerPct}%"></div>
                    </div>
                    <div class="aqi-bar-scale">
                        <span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span>
                    </div>
                </div>
                <div class="aqi-pollutants-grid">
                    <div class="aqi-pollutant-card">${dot('pm25', pm25)}<span class="aqi-pollutant-name">PM2.5</span><span class="aqi-pollutant-val">${fmt(pm25)}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card">${dot('pm10', pm10)}<span class="aqi-pollutant-name">PM10</span><span class="aqi-pollutant-val">${fmt(pm10)}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card">${dot('no2', no2)}<span class="aqi-pollutant-name">NO₂</span><span class="aqi-pollutant-val">${fmt(no2)}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card">${dot('o3', o3)}<span class="aqi-pollutant-name">O₃</span><span class="aqi-pollutant-val">${fmt(o3)}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                </div>
                <p class="aqi-source-note">Bron: Umweltbundesamt · Station: ${escHtml(nearest.city || nearest.name)}</p>
                <p class="aqi-panel-tip">${escHtml(t('aqi_tip_' + level.tipKey))}</p>
            </div>`;
        if (els.aqiOverlayBody) els.aqiOverlayBody.innerHTML = aqiHtml;
        if (els.aqiPanelBody) els.aqiPanelBody.innerHTML = aqiHtml;
        btn.onclick = () => toggleMetricPanel('aqi');
    } catch (e) {
        console.warn('UBA AQI mislukt, fallback naar Open-Meteo:', e.message);
        fetchAQI();
    }
}

// ============================================================

init();
