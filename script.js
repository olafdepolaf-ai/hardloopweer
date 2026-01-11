const CONFIG = {
    API_URL: 'https://api.open-meteo.com/v1/forecast',
    GEO_API_URL: 'https://geocoding-api.open-meteo.com/v1/search',
    DEFAULT_CITY: 'Amsterdam',
    DEFAULT_LAT: 52.3676,
    DEFAULT_LON: 4.9041
};

// UI Elements
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
    dewPoint: document.getElementById('dew-point'),
    recommendationBadge: document.getElementById('recommendation-badge'),
    clothingTip: document.getElementById('clothing-tip'),
    warnings: document.getElementById('weather-warnings'),
    hourlyForecast: document.getElementById('hourly-forecast'),
    app: document.getElementById('app'),
    webcamImg: document.getElementById('webcam-img'),
    webcamLocation: document.getElementById('webcam-location'),
    prevWebcam: document.getElementById('prev-webcam'),
    nextWebcam: document.getElementById('next-webcam'),
    iconContainer: document.getElementById('weather-icon-container'),
    comfortContainer: document.getElementById('comfort-container'),
    comfortLevel: document.getElementById('comfort-level')
};

// State
let state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    city: CONFIG.DEFAULT_CITY,
    webcams: [],
    webcamIdx: 0,
    chart: null
};

// Init
async function init() {
    updateTime();
    setInterval(updateTime, 10000);

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                state.lat = pos.coords.latitude;
                state.lon = pos.coords.longitude;
                fetchWeather();
                fetchWebcams();
                reverseGeocode(state.lat, state.lon);
            },
            () => {
                fetchWeather();
                fetchWebcams();
            }
        );
    } else {
        fetchWeather();
        fetchWebcams();
    }

    els.citySearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchCity(els.citySearch.value);
    });

    els.locationBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            state.lat = pos.coords.latitude;
            state.lon = pos.coords.longitude;
            fetchWeather();
            fetchWebcams();
            reverseGeocode(state.lat, state.lon);
        });
    });

    els.prevWebcam.addEventListener('click', () => cycleWebcam(-1));
    els.nextWebcam.addEventListener('click', () => cycleWebcam(1));

    if (els.webcamImg) {
        els.webcamImg.onerror = () => {
            els.webcamImg.src = "https://images.unsplash.com/photo-1590059103313-f3d8507542c5?auto=format&fit=crop&w=800&q=80"; // Fallback
            els.webcamLocation.innerText = "Beeld tijdelijk niet beschikbaar";
        };
    }

    if (window.lucide) lucide.createIcons();
}

function updateTime() {
    if (!els.currentTime) return;
    const now = new Date();
    els.currentTime.innerText = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
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
            fetchWebcams();
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
    } catch (err) {
        els.cityName.innerText = "Ergens op de wereld";
    }
}

async function fetchWeather() {
    const params = new URLSearchParams({
        latitude: state.lat,
        longitude: state.lon,
        current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'wind_speed_10m', 'wind_direction_10m'],
        hourly: ['temperature_2m', 'weather_code', 'dew_point_2m', 'precipitation'],
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
    renderHourly(data.hourly);
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

function renderHourly(hourly) {
    if (!els.hourlyForecast) return;
    els.hourlyForecast.innerHTML = '';
    const now = new Date().getHours();
    for (let i = now; i < now + 24; i++) {
        if (!hourly.temperature_2m[i]) break;
        const item = document.createElement('div');
        item.className = 'hourly-item';
        const date = new Date();
        date.setHours(i);
        const time = date.getHours() + ':00';
        const weather = getWeatherDesc(hourly.weather_code[i]);
        item.innerHTML = `
            <span class="hourly-time">${time}</span>
            <span class="hourly-icon">${weather.icon}</span>
            <span class="hourly-temp">${Math.round(hourly.temperature_2m[i])}°</span>
        `;
        els.hourlyForecast.appendChild(item);
    }
}

async function fetchWebcams() {
    try {
        state.webcams = [
            { title: "Centraal Station", url: "https://images.unsplash.com/photo-1590059103313-f3d8507542c5?auto=format&fit=crop&w=800&q=80" },
            { title: "Dam Square", url: "https://images.unsplash.com/photo-1524047934617-ce782c24e7f3?auto=format&fit=crop&w=800&q=80" },
            { title: "Canals View", url: "https://images.unsplash.com/photo-1512470876302-972fad2aa9dd?auto=format&fit=crop&w=800&q=80" }
        ];

        if (state.city !== "Amsterdam" && state.city !== "Jouw plekje") {
            const cityQuery = encodeURIComponent(state.city + " city");
            state.webcams = [
                { title: `${state.city} Stadsgezicht`, url: `https://source.unsplash.com/featured/?${cityQuery}` },
                { title: `${state.city} Omgeving`, url: `https://source.unsplash.com/featured/?nature,${cityQuery}` }
            ];
            // Fallback for newer Unsplash API behavior if source.unsplash.com fails
            if (state.city === "Utrecht") {
                state.webcams = [
                    { title: "Domtoren Utrecht", url: "https://images.unsplash.com/photo-1601662528567-526cd06f6582?auto=format&fit=crop&w=800&q=80" },
                    { title: "Grachten Utrecht", url: "https://images.unsplash.com/photo-1569428034239-695d1372c70a?auto=format&fit=crop&w=800&q=80" }
                ];
            }
        }

        state.webcamIdx = 0;
        updateWebcamUI();
    } catch (err) {
        console.error("Webcam ophalen mislukt:", err);
    }
}

function updateWebcamUI() {
    if (state.webcams.length > 0 && els.webcamImg) {
        const cam = state.webcams[state.webcamIdx];
        els.webcamImg.src = cam.url;
        if (els.webcamLocation) els.webcamLocation.innerText = cam.title;
    }
}

function cycleWebcam(dir) {
    state.webcamIdx = (state.webcamIdx + dir + state.webcams.length) % state.webcams.length;
    updateWebcamUI();
}

init();
