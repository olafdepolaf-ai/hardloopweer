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
    iconContainer: document.getElementById('weather-icon-container'),
    comfortContainer: document.getElementById('comfort-container'),
    comfortLevel: document.getElementById('comfort-level'),
    buienradarFrame: document.getElementById('buienradar-frame')
};

let state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    city: CONFIG.DEFAULT_CITY,
    chart: null,
    uvChart: null
};

async function init() {
    updateTime();
    setInterval(updateTime, 10000);
    updateBuienradar();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                state.lat = pos.coords.latitude;
                state.lon = pos.coords.longitude;
                fetchWeather();
                updateBuienradar();
                reverseGeocode(state.lat, state.lon);
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
        });
    });

    if (window.lucide) lucide.createIcons();
}

function updateTime() {
    if (!els.currentTime) return;
    const now = new Date();
    els.currentTime.innerText = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
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
        }
    } catch (err) {
        console.error("Zoektocht mislukt:", err);
    }
}

async function reverseGeocode(lat, lon) {
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        const data = await res.json();
        state.city = data.address.city || data.address.town || data.address.village || "Jouw plekje";
        els.cityName.innerText = state.city;
        updateBuienradar();
    } catch (err) {
        els.cityName.innerText = "Ergens op de wereld";
    }
}

async function fetchWeather() {
    const params = new URLSearchParams({
        latitude: state.lat,
        longitude: state.lon,
        current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'wind_speed_10m', 'wind_direction_10m'],
        hourly: ['temperature_2m', 'weather_code', 'dew_point_2m', 'precipitation', 'uv_index'],
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

    els.currentTemp.innerText = `${Math.round(current.temperature_2m)}°`;
    if (els.feelsLike) els.feelsLike.innerText = `${Math.round(current.apparent_temperature)}°`;
    if (els.humidity) els.humidity.innerText = `${Math.round(current.relative_humidity_2m)}%`;

    const bft = getBeaufort(current.wind_speed_10m);
    if (els.windForce) els.windForce.innerText = `${bft} Bft`;
    if (els.windArrow) {
        els.windArrow.style.transform = `rotate(${current.wind_direction_10m}deg)`;
    }

    const hourIdx = new Date().getHours();
    const dp = data.hourly.dew_point_2m[hourIdx];
    if (els.dewPoint) els.dewPoint.innerText = `${Math.round(dp)}°`;

    const weatherInfo = getWeatherDesc(current.weather_code);
    if (els.weatherDesc) els.weatherDesc.innerText = weatherInfo.desc;

    if (els.iconContainer) {
        els.iconContainer.innerHTML = `<i data-lucide="${weatherInfo.lucide}"></i>`;
    }
    if (window.lucide) lucide.createIcons();

    updateComfortLevel(dp, current.temperature_2m);
    generateRecommendation(current, dp);
    renderChart(data.hourly);
    renderUVChart(data.hourly);
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
        level = "Perfect: gaan met die banaan!";
        cssClass = "very-comfortable";
        adjustment = "Lekker knallen op volle snelheid!";
    } else if (sum <= 110) {
        level = "Prima renweertje";
        cssClass = "comfortable";
        adjustment = "Tempo: 0% - 0.5% langzamer";
    } else if (sum <= 120) {
        level = "Beetje klammig hoor";
        cssClass = "humid";
        adjustment = "Tempo: 0.5% - 1.0% langzamer";
    } else if (sum <= 130) {
        level = "Lekker warmpjes!";
        cssClass = "uncomfortable";
        adjustment = "Tempo: 1.0% - 2.0% langzamer";
    } else if (sum <= 140) {
        level = "Plakkerig!";
        cssClass = "uncomfortable";
        adjustment = "Tempo: 2.0% - 3.0% langzamer";
    } else if (sum <= 150) {
        level = "Pittig hoor, rustig aan!";
        cssClass = "oppressive";
        adjustment = "Tempo: 3.0% - 4.5% langzamer";
    } else if (sum <= 160) {
        level = "Zwaar hoor, pas op jezelf";
        cssClass = "oppressive";
        adjustment = "Tempo: 4.5% - 6.0% langzamer";
    } else if (sum <= 170) {
        level = "Poeh, echt afzien dit!";
        cssClass = "oppressive";
        adjustment = "Tempo: 6.0% - 8.0% langzamer";
    } else if (sum <= 180) {
        level = "Extreem! Blijf drinken!";
        cssClass = "oppressive";
        adjustment = "Tempo: 8.0% - 10.0% langzamer";
    } else {
        level = "Niet doen! Veel te risicovol";
        cssClass = "oppressive";
        adjustment = "Stop met rennen, zoek de schaduw!";
    }

    if (els.comfortLevel) {
        els.comfortLevel.innerHTML = `<strong>${level}</strong><br><small>${adjustment}</small>`;
    }
    els.comfortContainer.className = `comfort-badge ${cssClass}`;
}

function getWeatherDesc(code) {
    const codes = {
        0: { desc: "Strakblauwe lucht, heerlijk!", icon: "☀️", lucide: "sun" },
        1: { desc: "Appeltje-eitje zonnetje", icon: "🌤️", lucide: "sun" },
        2: { desc: "Wat wolkjes, prima zo", icon: "⛅", lucide: "cloud" },
        3: { desc: "Helemaal grijs, maar ach", icon: "☁️", lucide: "cloud" },
        45: { desc: "Mist! Pas op de paaltjes", icon: "🌫️", lucide: "cloud" },
        51: { desc: "Miezeren, word je hard van!", icon: "🌦️", lucide: "cloud-drizzle" },
        61: { desc: "Regen! Gratis verfrissing", icon: "🌧️", lucide: "cloud-rain" },
        71: { desc: "Sneeuw! Pas op voor de gladheid", icon: "❄️", lucide: "snowflake" },
        95: { desc: "Onweer! Blijf maar lekker binnen", icon: "⛈️", lucide: "cloud-lightning" }
    };
    return codes[code] || { desc: "Vreemd weertje vandaag", icon: "🌡️", lucide: "thermometer" };
}

function generateRecommendation(current, dewPoint) {
    const temp = current.temperature_2m;
    const feelsLike = current.apparent_temperature;
    const wind = current.wind_speed_10m;
    const bft = getBeaufort(wind);

    let badge = "Gaan met die banaan!";
    let type = "success";
    let tip = "";

    if (temp < 0) {
        badge = "Brrr, ijskoud!";
        type = "warning";
        tip = "<strong>Wat trekken we aan?</strong><br>Onder de 0°C zijn we geen helden: lange broek (tights) is een must! Trek ook een lekker jasje, een muts en handschoentjes aan.";
    } else if (temp >= 0 && temp <= 7) {
        badge = "Lekker frisjes hoor!";
        type = "success";
        tip = "<strong>Wat trekken we aan?</strong><br>Korte broek kan prima tot 0 graden voor de bikkels! Maar gooi er wel een jasje overheen.";
        if (feelsLike < 0 || bft >= 4) {
            tip += " Door die gure wind die snijdt zijn handschoentjes misschien toch een goed idee voor je vingertoppen.";
        }
    } else {
        badge = "Heerlijk renweertje!";
        type = "success";
        tip = "<strong>Wat trekken we aan?</strong><br>Boven de 7 graden is het T-shirt weer! Korte broek aan en vlammen maar.";
    }

    let warnings = [];
    if (bft >= 6) warnings.push("💨 Oei, flinke wind (6+ Bft)! Blijf uit de buurt van krakende takken.");
    if (temp > 25) warnings.push("🔥 Heet hoor! Drink genoeg water, anders droog je uit.");
    if (dewPoint > 18) warnings.push("💦 Pfff, wat een luchtvochtigheid. Rustig aan doen!");

    if (els.recommendationBadge) {
        els.recommendationBadge.innerText = badge;
        els.recommendationBadge.className = `badge ${type}`;
    }
    if (els.clothingTip) els.clothingTip.innerHTML = `<p>${tip}</p>`;

    if (els.warnings) {
        if (warnings.length > 0) {
            els.warnings.innerHTML = warnings.join('<br>');
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
    const nowISO = new Date().toISOString().substring(0, 14) + '00';
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
    if (uv < 1)  return { label: 'Geen',      cls: 'uv-none',      color: '#9E9E9E', tip: 'Geen UV-bescherming nodig voor je run.' };
    if (uv < 3)  return { label: 'Laag',      cls: 'uv-low',       color: '#57BB8A', tip: 'Weinig risico. Bij langdurig lopen wel smeren.' };
    if (uv < 6)  return { label: 'Matig',     cls: 'uv-moderate',  color: '#F9AB00', tip: 'Factor 15+ en zonnebril mee. Petje op!' };
    if (uv < 8)  return { label: 'Hoog',      cls: 'uv-high',      color: '#F57C00', tip: 'Factor 30+ en pet. Loop voor 10u of na 16u.' };
    if (uv < 11) return { label: 'Zeer hoog', cls: 'uv-very-high', color: '#D93025', tip: 'Factor 50+. Loop vroeg of laat, niet tussen 11–15u.' };
    return         { label: 'Extreem',         cls: 'uv-extreme',   color: '#7B1FA2', tip: 'Niet hardlopen in de middagzon!' };
}

function renderUVChart(hourly) {
    const canvas = document.getElementById('uv-chart');
    if (!canvas) return;

    const today = new Date().toISOString().substring(0, 10);
    const todayStart = hourly.time.findIndex(t => t.startsWith(today));
    if (todayStart === -1) return;

    const labels = [];
    const predicted = [];
    for (let i = todayStart; i < todayStart + 24 && i < hourly.time.length; i++) {
        labels.push(new Date(hourly.time[i]).getHours() + ':00');
        predicted.push(hourly.uv_index[i] ?? 0);
    }

    const currentHour = new Date().getHours();
    const maxUV = Math.max(...predicted);
    const uvInfo = getUVLevel(maxUV);

    const currentEl = document.getElementById('uv-current');
    const maxEl = document.getElementById('uv-max');
    const levelEl = document.getElementById('uv-level');
    const tipEl = document.getElementById('uv-tip');

    if (currentEl) currentEl.innerText = (predicted[currentHour] ?? 0).toFixed(1);
    if (maxEl) maxEl.innerText = maxUV.toFixed(1);
    if (levelEl) { levelEl.innerText = uvInfo.label; levelEl.className = `uv-badge ${uvInfo.cls}`; }
    if (tipEl) tipEl.innerText = uvInfo.tip;

    // Initiële gemeten curve: Open-Meteo verleden uren (null voor de toekomst)
    const measuredFallback = predicted.map((v, i) => i <= currentHour ? v : null);
    drawUVChart(canvas, uvInfo, labels, predicted, measuredFallback, currentHour);

    // Vervang gemeten curve door echte RIVM-meetwaarden als beschikbaar
    fetchRIVMUV().then(rivm => {
        if (!rivm) return;

        if (rivm.Band1 > 0 && currentEl) {
            currentEl.innerText = rivm.Band1.toFixed(1);
            currentEl.title = 'Gemeten door RIVM';
        }

        // Bands 82-108 zijn meetwaarden: Band108 = nu, elke stap terug = 15 min
        const now = new Date();
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        const rivmMeasured = new Array(24).fill(null);
        const bucketCount = new Array(24).fill(0);

        for (let b = 82; b <= 108; b++) {
            const val = rivm['Band' + b];
            if (!val || val < 0) continue;
            const minsAgo = (108 - b) * 15;
            const measureMin = nowMinutes - minsAgo;
            if (measureMin < 0) continue;
            const hour = Math.round(measureMin / 60);
            if (hour < 0 || hour > 23) continue;
            // Gemiddelde per uur (meerdere 15-min waarden per uur)
            rivmMeasured[hour] = rivmMeasured[hour] === null
                ? val
                : (rivmMeasured[hour] * bucketCount[hour] + val) / (bucketCount[hour] + 1);
            bucketCount[hour]++;
        }

        if (rivmMeasured.some(v => v !== null)) {
            drawUVChart(canvas, uvInfo, labels, predicted, rivmMeasured, currentHour);
        }
    });
}

function drawUVChart(canvas, uvInfo, labels, predicted, measured, currentHour) {
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.offsetHeight || 180);
    grad.addColorStop(0, uvInfo.color + '30');
    grad.addColorStop(1, uvInfo.color + '05');

    if (state.uvChart) state.uvChart.destroy();

    state.uvChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Verwacht',
                    data: predicted,
                    borderColor: uvInfo.color + '66',
                    backgroundColor: grad,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    borderWidth: 2,
                    borderDash: [6, 4]
                },
                {
                    label: 'Gemeten',
                    data: measured,
                    borderColor: uvInfo.color,
                    backgroundColor: 'transparent',
                    fill: false,
                    tension: 0.15,
                    pointRadius: measured.map(v => v !== null ? 3.5 : 0),
                    pointBackgroundColor: uvInfo.color,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 1.5,
                    borderWidth: 2.5,
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'end',
                    labels: {
                        boxWidth: 24,
                        padding: 12,
                        font: { size: 11 },
                        color: '#5f6368',
                        usePointStyle: true,
                        pointStyle: 'line'
                    }
                },
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
                    suggestedMax: Math.max(Math.max(...predicted) + 0.5, 3),
                    grid: { color: 'rgba(0,0,0,0.05)' },
                    ticks: { font: { size: 11 } }
                }
            }
        }
    });
}

init();
