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
    windSpeed: document.getElementById('wind-speed'),
    dewPoint: document.getElementById('dew-point'),
    recommendationBadge: document.getElementById('recommendation-badge'),
    clothingTip: document.getElementById('clothing-tip'),
    warnings: document.getElementById('weather-warnings'),
    hourlyForecast: document.getElementById('hourly-forecast'),
    app: document.getElementById('app')
};

// State
let state = {
    lat: CONFIG.DEFAULT_LAT,
    lon: CONFIG.DEFAULT_LON,
    city: CONFIG.DEFAULT_CITY
};

// Init
async function init() {
    updateTime();
    setInterval(updateTime, 60000);
    
    // Try to get user location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                state.lat = pos.coords.latitude;
                state.lon = pos.coords.longitude;
                fetchWeather();
                reverseGeocode(state.lat, state.lon);
            },
            () => {
                fetchWeather(); // Fallback to Amsterdam
            }
        );
    } else {
        fetchWeather();
    }

    // Event Listeners
    els.citySearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchCity(els.citySearch.value);
    });

    els.locationBtn.addEventListener('click', () => {
        navigator.geolocation.getCurrentPosition((pos) => {
            state.lat = pos.coords.latitude;
            state.lon = pos.coords.longitude;
            fetchWeather();
            reverseGeocode(state.lat, state.lon);
        });
    });
}

function updateTime() {
    const now = new Date();
    els.currentTime.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

async function searchCity(query) {
    if (!query) return;
    try {
        const res = await fetch(`${CONFIG.GEO_API_URL}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const loc = data.results[0];
            state.lat = loc.latitude;
            state.lon = loc.longitude;
            state.city = loc.name;
            els.cityName.innerText = state.city;
            fetchWeather();
        }
    } catch (err) {
        console.error("Search failed:", err);
    }
}

async function reverseGeocode(lat, lon) {
    // Open-Meteo doesn't have a direct reverse geocode API, 
    // but we can use bigdatacloud or similar for free or just say "Current Location"
    els.cityName.innerText = "Lokaal";
}

async function fetchWeather() {
    const params = new URLSearchParams({
        latitude: state.lat,
        longitude: state.lon,
        current: ['temperature_2m', 'relative_humidity_2m', 'apparent_temperature', 'is_day', 'weather_code', 'wind_speed_10m'],
        hourly: ['temperature_2m', 'weather_code', 'dew_point_2m'],
        timezone: 'auto',
        forecast_days: 1
    });

    try {
        const res = await fetch(`${CONFIG.API_URL}?${params.toString()}`);
        const data = await res.json();
        updateUI(data);
    } catch (err) {
        console.error("Weather fetch failed:", err);
    }
}

function updateUI(data) {
    const current = data.current;
    const hourly = data.hourly;
    
    // Basic Info
    els.currentTemp.innerText = `${Math.round(current.temperature_2m)}°`;
    els.feelsLike.innerText = `${Math.round(current.apparent_temperature)}°`;
    els.windSpeed.innerText = `${Math.round(current.wind_speed_10m)} km/h`;
    
    // Dew point from current hourly index
    const hourIdx = new Date().getHours();
    const dp = hourly.dew_point_2m[hourIdx];
    els.dewPoint.innerText = `${Math.round(dp)}°`;

    const weatherInfo = getWeatherDesc(current.weather_code);
    els.weatherDesc.innerText = weatherInfo.desc;
    
    // Logic for running
    generateRecommendation(current, dp);
    
    // Hourly
    renderHourly(data.hourly);
    
    // Theme
    updateTheme(current.weather_code, current.is_day);
}

function getWeatherDesc(code) {
    const codes = {
        0: { desc: "Clear sky", icon: "☀️" },
        1: { desc: "Mainly clear", icon: "🌤️" },
        2: { desc: "Partly cloudy", icon: "⛅" },
        3: { desc: "Overcast", icon: "☁️" },
        45: { desc: "Fog", icon: "🌫️" },
        51: { desc: "Drizzle", icon: "🌦️" },
        61: { desc: "Rain", icon: "🌧️" },
        71: { desc: "Snow", icon: "❄️" },
        95: { desc: "Thunderstorm", icon: "⛈️" }
    };
    return codes[code] || { desc: "Unknown", icon: "🌡️" };
}

function generateRecommendation(current, dewPoint) {
    const temp = current.temperature_2m;
    const feelsLike = current.apparent_temperature;
    const wind = current.wind_speed_10m;
    
    let badge = "Prima hardloopweer!";
    let type = "success";
    let tip = "";

    // Clothing logic based on user rules
    if (temp < 0) {
        badge = "Koud! Kleed je dik aan.";
        type = "warning";
        tip = "<strong>Wat trek je aan?</strong><br>Onder de 0°C is een lange broek (tights) essentieel. Draag ook een jasje, een muts en handschoentjes.";
    } else if (temp >= 0 && temp <= 7) {
        badge = "Frisjes, maar goed te doen.";
        type = "success";
        tip = "<strong>Wat trek je aan?</strong><br>Korte broek kan tot 0 graden! Maar draag wel een jasje. ";
        if (feelsLike < 0 || wind > 20) {
            tip += "Omdat de gevoelstemperatuur laag is of het hard waait, zijn handschoenen of een matje aanbevolen.";
        }
    } else {
        badge = "Lekker hardloopweer!";
        type = "success";
        tip = "<strong>Wat trek je aan?</strong><br>Boven de 7 graden loop je natuurlijk in een T-shirt en korte broek.";
    }

    // Warnings
    let warnings = [];
    if (wind > 40) warnings.push("⚠️ Harde wind! Pas op voor takken en windvlagen.");
    if (temp > 25) warnings.push("☀️ Warm! Vergeet niet te hydrateren.");
    if (dewPoint > 18) warnings.push("💧 Hoge luchtvochtigheid (benauwd).");

    els.recommendationBadge.innerText = badge;
    els.recommendationBadge.className = `badge ${type}`;
    els.clothingTip.innerHTML = `<p>${tip}</p>`;

    if (warnings.length > 0) {
        els.warnings.innerHTML = warnings.join('<br>');
        els.warnings.classList.remove('hidden');
    } else {
        els.warnings.classList.add('hidden');
    }
}

function renderHourly(hourly) {
    els.hourlyForecast.innerHTML = '';
    const now = new Date().getHours();
    
    for (let i = now; i < now + 8; i++) {
        if (!hourly.temperature_2m[i]) break;
        
        const item = document.createElement('div');
        item.className = 'hourly-item';
        const time = i % 24;
        const temp = Math.round(hourly.temperature_2m[i]);
        const code = hourly.weather_code[i];
        const icon = getWeatherDesc(code).icon;
        
        item.innerHTML = `
            <span class="hourly-time">${time}:00</span>
            <span class="hourly-icon">${icon}</span>
            <span class="hourly-temp">${temp}°</span>
        `;
        els.hourlyForecast.appendChild(item);
    }
}

function updateTheme(code, isDay) {
    let bg = "#f0f4f8";
    if (!isDay) {
        bg = "#1a1c1e";
        document.body.style.color = "#ffffff";
        var root = document.querySelector(':root');
        root.style.setProperty('--card-bg', 'rgba(40, 44, 52, 0.8)');
        root.style.setProperty('--text-primary', '#ffffff');
        root.style.setProperty('--text-secondary', '#abb2bf');
    } else {
        if (code >= 61) bg = "#e1e8f0"; // Rain
        else if (code <= 3) bg = "#fff9e6"; // Sunny/Clear
    }
    document.body.style.background = bg;
}

init();
