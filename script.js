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
    searchToggle: document.getElementById('search-toggle')
};

let state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    city: CONFIG.DEFAULT_CITY,
    chart: null,
    uvChart: null,
    utcOffsetSeconds: 3600,
    timezone: 'Europe/Amsterdam',
    lang: detectLanguage()
};

// Current hour at the searched location (not device local time)
function locationHour() {
    return Math.floor((Date.now() / 1000 + state.utcOffsetSeconds) / 3600) % 24;
}

// Local ISO timestamp at searched location, for comparing with API hourly.time strings
function locationISO() {
    return new Date(Date.now() + state.utcOffsetSeconds * 1000).toISOString().replace('Z', '');
}

function isInNetherlands() {
    return state.lat >= 50.5 && state.lat <= 53.7 && state.lon >= 3.3 && state.lon <= 7.3;
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

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                state.lat = pos.coords.latitude;
                state.lon = pos.coords.longitude;
                fetchWeather();
                updateBuienradar();
                reverseGeocode(state.lat, state.lon);
                onLocationGranted();
            },
            () => {
                fetchWeather();
            }
        );
    } else {
        fetchWeather();
    }

    els.citySearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchCity(els.citySearch.value);
    });

    els.locationBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            state.lat = pos.coords.latitude;
            state.lon = pos.coords.longitude;
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
    els.buienradarFrame.src = `https://gadgets.buienradar.nl/gadget/zoommap/?lat=${state.lat}&lng=${state.lon}&overname=2&zoom=10&zoomlevel=0&pins=0&naam=${encodeURIComponent(state.city)}`;
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
    renderChart(data.hourly);
    renderUVChart(data.hourly, data.daily);
}

function updateComfortLevel(dewPoint, temp) {
    const tempF = (temp * 9 / 5) + 32;
    const dpF = (dewPoint * 9 / 5) + 32;
    const sum = tempF + dpF;

    if (!els.comfortContainer) return;
    els.comfortContainer.classList.remove('hidden');
    let level = "";
    let cssClass = "";
    let adjustment = "";

    if (sum <= 100) {
        level = t('comfort_perfect');  cssClass = "very-comfortable"; adjustment = t('comfort_adj_perfect');
    } else if (sum <= 110) {
        level = t('comfort_good');     cssClass = "comfortable";      adjustment = t('comfort_adj_good');
    } else if (sum <= 120) {
        level = t('comfort_sticky');   cssClass = "humid";            adjustment = t('comfort_adj_sticky');
    } else if (sum <= 130) {
        level = t('comfort_warm');     cssClass = "uncomfortable";    adjustment = t('comfort_adj_warm');
    } else if (sum <= 140) {
        level = t('comfort_tacky');    cssClass = "uncomfortable";    adjustment = t('comfort_adj_tacky');
    } else if (sum <= 150) {
        level = t('comfort_tough');    cssClass = "oppressive";       adjustment = t('comfort_adj_tough');
    } else if (sum <= 160) {
        level = t('comfort_heavy');    cssClass = "oppressive";       adjustment = t('comfort_adj_heavy');
    } else if (sum <= 170) {
        level = t('comfort_suffer');   cssClass = "oppressive";       adjustment = t('comfort_adj_suffer');
    } else if (sum <= 180) {
        level = t('comfort_extreme');  cssClass = "oppressive";       adjustment = t('comfort_adj_extreme');
    } else {
        level = t('comfort_stop');     cssClass = "oppressive";       adjustment = t('comfort_adj_stop');
    }

    if (els.comfortLevel) {
        els.comfortLevel.innerHTML = `<strong>${level}</strong><br><small>${adjustment}</small>`;
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

function renderChart(hourly) {
    const canvas = document.getElementById('temp-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const nowISO = locationISO().substring(0, 14) + '00';
    let startIndex = hourly.time.findIndex(t => t >= nowISO);
    if (startIndex === -1) startIndex = 0;

    const labels = [];
    const temps = [];
    const rain = [];

    for (let i = startIndex; i < startIndex + 48; i++) {
        if (hourly.temperature_2m[i] === undefined) break;
        const date = new Date(hourly.time[i]);
        const day = date.toLocaleDateString('nl-NL', { weekday: 'short' });
        const time = date.getHours() + ':00';
        labels.push(date.getHours() === 0 ? `${day} ${time}` : time);
        temps.push(hourly.temperature_2m[i]);
        rain.push(hourly.precipitation[i] || 0);
    }

    if (state.chart) state.chart.destroy();

    state.chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Temp (°C)',
                    data: temps,
                    borderColor: '#1a73e8',
                    backgroundColor: 'rgba(26, 115, 232, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y'
                },
                {
                    label: 'Regen (mm)',
                    data: rain,
                    borderColor: '#1e8e3e',
                    backgroundColor: 'rgba(30, 142, 62, 0.1)',
                    fill: true,
                    tension: 0.4,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                x: { grid: { display: true, color: 'rgba(0,0,0,0.05)' } },
                y: {
                    display: true,
                    position: 'left',
                    title: { display: true, text: '°C', font: { weight: 'bold', size: 14 }, color: '#1a1b1e' }
                },
                y1: {
                    display: true,
                    position: 'right',
                    min: 0,
                    suggestedMax: 2,
                    title: { display: true, text: 'mm', font: { weight: 'bold', size: 14 }, color: '#1a1b1e' },
                    grid: { display: false }
                }
            }
        }
    });

    const wrapper = document.querySelector('.chart-scroll-wrapper');
    if (wrapper) wrapper.scrollLeft = 0;
}

// ---- UV / Zonkracht ----

const UV_ZONES = [
    { min: 0, max: 3,        color: '#57BB8A' },
    { min: 3, max: 5,        color: '#F9AB00' },
    { min: 5, max: 7,        color: '#F57C00' },
    { min: 7, max: Infinity, color: '#D93025' }
];

function uvZoneColor(v) {
    if (v < 3) return '#57BB8A';
    if (v < 5) return '#F9AB00';
    if (v < 7) return '#F57C00';
    return '#D93025';
}

const uvBandPlugin = {
    id: 'uvBands',
    beforeDraw(chart) {
        const { ctx, chartArea: { left, right, top, bottom }, scales: { y } } = chart;
        [
            { yMin: 0, yMax: 3,        color: '#57BB8A14' },
            { yMin: 3, yMax: 5,        color: '#F9AB0014' },
            { yMin: 5, yMax: 7,        color: '#F57C0014' },
            { yMin: 7, yMax: y.max,    color: '#D9302514' }
        ].forEach(({ yMin, yMax, color }) => {
            const yTop = y.getPixelForValue(Math.min(yMax, y.max));
            const yBot = y.getPixelForValue(Math.max(yMin, y.min));
            if (yTop >= bottom || yBot <= top) return;
            ctx.fillStyle = color;
            ctx.fillRect(left, Math.max(yTop, top), right - left, Math.min(yBot, bottom) - Math.max(yTop, top));
        });
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

async function fetchRIVMUV() {
    try {
        const rd = wgs84ToRD(state.lat, state.lon);
        const i = Math.round((rd.x + 150000) / 600000 * 900);
        const j = Math.round((800000 - rd.y) / 700000 * 900);
        if (i < 0 || i > 900 || j < 0 || j > 900) return null;
        const url = `https://data.rivm.nl/geo/alo/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&QUERY_LAYERS=rivm_zonkracht&LAYERS=rivm_zonkracht&INFO_FORMAT=application/json&FEATURE_COUNT=1&I=${i}&J=${j}&CRS=EPSG:28992&WIDTH=900&HEIGHT=900&BBOX=-150000,100000,450000,800000`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.features?.length > 0) return data.features[0].properties;
    } catch (e) {
        console.warn('RIVM UV niet beschikbaar:', e.message);
    }
    return null;
}

function getUVLevel(uv) {
    if (uv < 1) return { label: t('uv_none'),     cls: 'uv-none',      color: '#9E9E9E', tip: t('uv_tip_none') };
    if (uv < 3) return { label: t('uv_low'),      cls: 'uv-low',       color: '#57BB8A', tip: t('uv_tip_low') };
    if (uv < 5) return { label: t('uv_moderate'), cls: 'uv-moderate',  color: '#F9AB00', tip: t('uv_tip_moderate') };
    if (uv < 7) return { label: t('uv_high'),     cls: 'uv-high',      color: '#F57C00', tip: t('uv_tip_high') };
    return       { label: t('uv_very_high'),       cls: 'uv-very-high', color: '#D93025', tip: t('uv_tip_very_high') };
}

function renderUVChart(hourly, daily) {
    const canvas = document.getElementById('uv-chart');
    if (!canvas) return;

    const today = locationISO().substring(0, 10);
    const todayStart = hourly.time.findIndex(t => t.startsWith(today));
    if (todayStart === -1) return;

    // Determine X-axis window: 1h before sunrise → 1h after sunset, min 12h
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

    const labels = [];
    const predicted = [];
    for (let i = todayStart + startHour; i <= todayStart + endHour && i < hourly.time.length; i++) {
        labels.push(hourly.time[i].substring(11, 16));
        predicted.push(hourly.uv_index[i] ?? 0);
    }

    const currentHour = locationHour();
    const currentHourInSlice = currentHour - startHour;
    const maxUV = Math.max(...predicted);
    const uvInfo = getUVLevel(maxUV);

    const currentEl = document.getElementById('uv-current');
    const maxEl = document.getElementById('uv-max');
    const levelEl = document.getElementById('uv-level');
    const tipEl = document.getElementById('uv-tip');

    const currentUVValue = hourly.uv_index[todayStart + currentHour] ?? 0;
    if (currentEl) currentEl.innerText = currentUVValue.toFixed(1);
    if (maxEl) maxEl.innerText = maxUV.toFixed(1);
    if (levelEl) { levelEl.innerText = uvInfo.label; levelEl.className = `uv-badge ${uvInfo.cls}`; }
    if (tipEl) tipEl.innerText = uvInfo.tip;

    // Initiële gemeten curve: verleden uren t/m nu (null voor toekomst)
    const measuredFallback = predicted.map((v, i) => i <= currentHourInSlice ? v : null);
    drawUVChart(canvas, uvInfo, labels, predicted, measuredFallback);

    // Vervang gemeten curve door echte RIVM-meetwaarden als beschikbaar
    fetchRIVMUV().then(rivm => {
        if (!rivm) return;

        if (rivm.Band1 > 0 && currentEl) {
            currentEl.innerText = rivm.Band1.toFixed(1);
            currentEl.title = t('rivm_measured');
        }

        // Bands 82-108 zijn meetwaarden: Band108 = nu, elke stap terug = 15 min
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const rivmFull = new Array(24).fill(null);
        const bucketCount = new Array(24).fill(0);

        for (let b = 82; b <= 108; b++) {
            const val = rivm['Band' + b];
            if (!val || val < 0) continue;
            const minsAgo = (108 - b) * 15;
            const measureMin = nowMinutes - minsAgo;
            if (measureMin < 0) continue;
            const hour = Math.round(measureMin / 60);
            if (hour < 0 || hour > 23) continue;
            rivmFull[hour] = rivmFull[hour] === null
                ? val
                : (rivmFull[hour] * bucketCount[hour] + val) / (bucketCount[hour] + 1);
            bucketCount[hour]++;
        }

        const rivmSliced = rivmFull.slice(startHour, endHour + 1);
        if (rivmSliced.some(v => v !== null)) {
            drawUVChart(canvas, uvInfo, labels, predicted, rivmSliced);
        }
    });
}

function drawUVChart(canvas, uvInfo, labels, predicted, measured) {
    const ctx = canvas.getContext('2d');
    if (state.uvChart) state.uvChart.destroy();

    const maxPredicted = Math.max(...predicted.filter(v => v !== null && v > 0), 0);
    const maxMeasured = Math.max(...measured.filter(v => v !== null && v > 0), 0);
    const chartMax = Math.max(maxPredicted, maxMeasured);

    state.uvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: t('uv_label_predicted'),
                    data: predicted,
                    borderColor: uvInfo.color + '66',
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2,
                    borderDash: [6, 4],
                    segment: {
                        borderColor: c => uvZoneColor(c.p1.parsed.y) + '88'
                    }
                },
                {
                    label: t('uv_label_measured'),
                    data: measured,
                    borderColor: uvInfo.color,
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.15,
                    pointRadius: measured.map(v => v !== null ? 3.5 : 0),
                    pointBackgroundColor: measured.map(v => v !== null ? uvZoneColor(v) : 'transparent'),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    borderWidth: 2.5,
                    spanGaps: false,
                    segment: {
                        borderColor: c => uvZoneColor(c.p1.parsed.y)
                    }
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
                    callbacks: {
                        label: item => item.parsed.y !== null
                            ? `${item.dataset.label}: ${item.parsed.y.toFixed(1)}`
                            : null,
                        filter: item => item.parsed.y !== null
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, font: { size: 11 } }
                },
                y: {
                    min: 0,
                    suggestedMax: Math.max(Math.ceil(chartMax) + 1, 3),
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 11 } }
                }
            }
        },
        plugins: [uvBandPlugin]
    });
}

init();
