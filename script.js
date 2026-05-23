const WARN = { green: '#57BB8A', yellow: '#F9AB00', orange: '#F57C00', red: '#D93025', none: '#9E9E9E' };

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
    state.lat = lat;
    state.lon = lon;
    state.city = name;
    els.cityName.innerText = name;
    els.citySearch.value = name;
    hideSuggestions();
    saveLastLocation();
    saveRecentLocation({ lat, lon, city: name });
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
        `<li class="search-suggestion-item is-recent" data-idx="${i}" data-lat="${r.lat}" data-lon="${r.lon}" data-name="${escAttr(r.city)}">
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
            }
        );
    } else {
        if (DEBUG) { state._debug.geoSource = 'default (geen geo-API)'; renderDebug(); }
    }

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
    const barColors = speeds.map(bft => getWindDotColor(bft));
    const gustMarkers = gusts.map((bft, i) => ({ seriesIndex: 1, dataPointIndex: i, fillColor: getWindDotColor(bft), strokeColor: getWindDotColor(bft), size: 4 }));

    const series = [
        { name: 'Wind (Bft)', type: 'bar', data: speeds },
        ...(hasGusts ? [{ name: 'Windstoten (Bft)', type: 'line', data: gusts }] : []),
    ];

    state.windChart = new ApexCharts(el, {
        series,
        chart: { type: 'bar', height: 220, background: 'transparent', toolbar: { show: false }, animations: { enabled: false }, fontFamily: 'inherit' },
        theme: { mode: dark ? 'dark' : 'light' },
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth', width: [0, 2] },
        colors: [() => barColors, dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)'],
        plotOptions: { bar: { borderRadius: 2, columnWidth: '60%', distributed: true } },
        fill: { opacity: [0.85, 1] },
        markers: { size: [0, 4], discrete: gustMarkers },
        xaxis: { categories: labels, tickAmount: 6, labels: { style: { fontSize: '10px', colors: theme.labelColor } }, axisBorder: { show: false }, axisTicks: { show: false } },
        yaxis: { min: 0, max: Math.max(...speeds, ...gusts, 3) + 1, tickAmount: 4, labels: { style: { fontSize: '10px', colors: theme.labelColor }, formatter: v => Number.isInteger(v) ? `${v} Bft` : '' } },
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
            saveLastLocation();
            saveRecentLocation({ lat: state.lat, lon: state.lon, city: state.city });
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
        saveLastLocation();
        saveRecentLocation({ lat: state.lat, lon: state.lon, city: state.city });
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

    // Show Buienradar + weather report only when viewing a Dutch location
    const buienradarSection = document.getElementById('buienradar-section');
    if (buienradarSection) {
        buienradarSection.classList.toggle('hidden', !isInNetherlands());
        if (isInNetherlands()) requestAnimationFrame(scaleBuienradar);
    }
    const weatherReportCard = document.getElementById('weather-report-card');
    if (weatherReportCard && !isInNetherlands()) weatherReportCard.classList.add('hidden');

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
        renderDebug();
    }
    fetchWeatherAlerts().then(renderAlerts);
    fetchAQI();
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

        // Show API headline as bold title of the weather report card
        const reportTitleEl = document.getElementById('weather-report-title');
        if (reportTitleEl && wr.title) {
            reportTitleEl.innerHTML = wr.title;
            reportTitleEl.classList.remove('hidden');
        }

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

        const summaryEl = document.getElementById('weather-report-summary');
        if (summaryEl) {
            const summaryText = decodeHtml(wr.summary || '');
            const timeStr = formatPublishedTime(wr.published || '');
            summaryEl.innerHTML = escHtml(summaryText)
                + (timeStr ? ` <span class="weather-report-time">${escHtml(timeStr)}</span>` : '');
        }

        const textEl = document.getElementById('weather-report-text');
        if (textEl) {
            const bodyText = decodeHtml(wr.text || '');
            // Add blank line before sentences starting with "Morgen"
            const processed = bodyText.replace(/([.!?])\s+(Morgen|morgen)/g, '$1\n\n$2');
            textEl.textContent = processed;
        }

        const shorttermEl = document.getElementById('weather-shortterm');
        if (shorttermEl && shortterm?.forecast) {
            const range = shortterm.startdate && shortterm.enddate
                ? `${formatDateRange(shortterm.startdate, shortterm.enddate)}: `
                : '';
            shorttermEl.textContent = range + shortterm.forecast;
        }

        const longtermEl = document.getElementById('weather-longterm');
        if (longtermEl && longterm?.forecast) {
            const range = longterm.startdate && longterm.enddate
                ? `${formatDateRange(longterm.startdate, longterm.enddate)}: `
                : '';
            longtermEl.textContent = range + longterm.forecast;
        }

        card.classList.remove('hidden');
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
        `<b>Buienradar regen</b>: ${d.buienradarRain}`
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
                    <div class="aqi-pollutant-card"><span class="aqi-pollutant-name">PM2.5</span><span class="aqi-pollutant-val">${pm25}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card"><span class="aqi-pollutant-name">PM10</span><span class="aqi-pollutant-val">${pm10}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card"><span class="aqi-pollutant-name">NO₂</span><span class="aqi-pollutant-val">${no2}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
                    <div class="aqi-pollutant-card"><span class="aqi-pollutant-name">O₃</span><span class="aqi-pollutant-val">${o3}</span><span class="aqi-pollutant-unit">µg/m³</span></div>
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

init();
