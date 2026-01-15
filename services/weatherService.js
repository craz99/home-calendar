// services/weatherService.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const OPENWEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';

const CACHE_FILE_PATH = path.join(__dirname, '..', 'cache', 'weatherCache.json');
const CACHE_LIFETIME_HOURS = 6;

const DEFAULT_LATITUDE = parseFloat(process.env.WEATHER_DEFAULT_LATITUDE) || 34.0522;
const DEFAULT_LONGITUDE = parseFloat(process.env.WEATHER_DEFAULT_LONGITUDE) || -118.2437;

if (!OPENWEATHER_API_KEY) {
    console.error('CRITICAL ERROR: OPENWEATHER_API_KEY environment variable is not set!');
}

let cachedWeatherData = null;
let lastFetchTime = 0;

/**
 * Initializes the weather service by loading cached data from file.
 */
const initializeWeatherService = async () => {
    try {
        const data = await fs.readFile(CACHE_FILE_PATH, 'utf8');
        const parsedData = JSON.parse(data);

        if (parsedData && parsedData.timestamp && (Date.now() - parsedData.timestamp < CACHE_LIFETIME_HOURS * 60 * 60 * 1000)) {
            cachedWeatherData = parsedData.forecast;
            lastFetchTime = parsedData.timestamp;
            console.log('Weather service initialized: Loaded fresh data from cache file.');
        } else {
            console.log('Weather service initialized: Cache file either not found, corrupted, or too old. Will fetch new data.');
        }
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('Weather service initialized: No weather cache file found. Will fetch new data.');
        } else {
            console.error('Weather service initialization error (could not read/parse cache file):', error.message);
        }
        cachedWeatherData = null;
        lastFetchTime = 0;
    }
};

/**
 * Fetches weather forecast from OpenWeatherMap API and caches it.
 * @returns {Array} An array of daily forecast objects.
 */
const fetchAndCacheWeather = async () => {
    if (!OPENWEATHER_API_KEY) {
        console.error('Cannot fetch weather: OPENWEATHER_API_KEY is not set.');
        throw new Error('Weather API key is missing.');
    }

    console.log(`Attempting to fetch weather data for lat=${DEFAULT_LATITUDE}, lon=${DEFAULT_LONGITUDE} from OpenWeatherMap API...`);
    try {
        const requestUrl = `${OPENWEATHER_BASE_URL}/forecast/daily?lat=${DEFAULT_LATITUDE}&lon=${DEFAULT_LONGITUDE}&cnt=10&appid=${OPENWEATHER_API_KEY}&units=imperial`;
        console.log('Axios attempting to call:', requestUrl); // Log the exact URL

        const headers = {
            "User-Agent":
                "Mozilla/5.0 (X11; Linux x86_64; rv:138.0) Gecko/20100101 Firefox/138.0",
        };

        const response = await axios.get(requestUrl, { timeout: 10000, headers });

        const forecast = response.data.list;
        const timestamp = Date.now();

        cachedWeatherData = forecast;
        lastFetchTime = timestamp;

        await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
        await fs.writeFile(CACHE_FILE_PATH, JSON.stringify({ forecast, timestamp }), 'utf8');
        console.log('Weather data fetched and cached successfully.');
        return forecast;

    } catch (error) {
        // --- ENHANCED ERROR LOGGING ---
        console.error('Error details from OpenWeatherMap API call:');
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('  Status:', error.response.status);
            console.error('  Headers:', error.response.headers);
            console.error('  Data:', JSON.stringify(error.response.data, null, 2)); // Prettify JSON
            // Common OpenWeatherMap error codes and messages:
            // 401: Invalid API key, or key not activated
            // 404: City not found (less likely with lat/lon, but possible if base URL is wrong)
            // 429: Too many requests (rate limit exceeded)
        } else if (error.request) {
            // The request was made but no response was received
            // `error.request` is an instance of XMLHttpRequest in the browser and an http.ClientRequest in node.js
            console.error('  No response received. Request details:', error.request);
            console.error('  Possible network issue or server down.');
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('  Error message:', error.message);
            console.error('  This is likely a configuration error with Axios itself or the API call.');
        }
        console.error('  Full error object:', error); // Log the entire error object for maximum detail
        // --- END ENHANCED ERROR LOGGING ---

        throw new Error('Failed to fetch weather data from external API.'); // Re-throw generic error
    }
};

/**
 * Main function to get weather forecast.
 * It uses cached data if fresh, otherwise fetches new data.
 * @returns {Array} An array of daily forecast objects.
 */
const getCachedOrFreshWeather = async () => {
    const now = Date.now();
    const cacheExpired = (now - lastFetchTime) > (CACHE_LIFETIME_HOURS * 60 * 60 * 1000);

    if (cachedWeatherData && !cacheExpired) {
        console.log('Serving weather data from in-memory cache.');
        return cachedWeatherData;
    } else {
        try {
            return await fetchAndCacheWeather();
        } catch (error) {
            console.error('Error in getCachedOrFreshWeather (fallback logic):', error.message); // Updated log message
            if (cachedWeatherData) {
                console.warn('Returning potentially outdated cached weather data due to fresh fetch failure.');
                return cachedWeatherData;
            }
            throw error;
        }
    }
};

initializeWeatherService();

export {
    getCachedOrFreshWeather,
    initializeWeatherService
};