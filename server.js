// server.js
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- Environment Variable Loading ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (process.env.NODE_ENV !== 'production') {
    const envFilePath = path.join(__dirname, '.env.development');

    if (fs.existsSync(envFilePath)) {
        dotenv.config({ path: envFilePath });
    } else {
        // Fallback for cases where .env.development is not found,
        // still try to load a generic .env if it exists.
        dotenv.config();
    }
} else {
    // In production, environment variables are typically set by the hosting platform,
    // so dotenv.config() is often not needed or is handled differently.
    dotenv.config(); // Still call in case .env exists for prod defaults
}

// --- Initial Server Logging (Essential) ---
// These logs are useful to confirm essential configurations on startup.
console.log(`Server environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`Server running on port ${process.env.PORT || 5500}`);
console.log(`OpenWeather API Key loaded: ${!!process.env.OPENWEATHER_API_KEY}`); // Just checks if it's truthy, not revealing the key
console.log(`Default Weather Location: Lat ${process.env.WEATHER_DEFAULT_LATITUDE}, Lon ${process.env.WEATHER_DEFAULT_LONGITUDE}`);

// --- Core Imports ---
import express from 'express';
import cors from 'cors';

// Service Imports
import { getCalendarEventsFromUrls } from './services/calendarService.js';
import { getCachedOrFreshWeather, initializeWeatherService } from './services/weatherService.js';
import { getOctoPrintStatus } from './services/octoPrintService.js';
import { getGarageDoorState, initializeGarageDoorService } from './services/garageDoorService.js';
import {DateTime} from "luxon";


const app = express();
const PORT = process.env.PORT || 5500; // Use PORT from .env or default to 5500
const isProduction = process.env.NODE_ENV === 'production';

// Initialize services once during app startup
initializeWeatherService();

// Load and cache full config (including credentials) on startup
let serverConfig = null;
const configPath = path.join(__dirname, 'public-config.json');
try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    serverConfig = JSON.parse(configData);
    const showGarageDoorStatus = serverConfig?.styleSettings?.showGarageDoorStatus ?? false;
    if (showGarageDoorStatus) {
        initializeGarageDoorService();
    }
} catch (error) {
    console.warn('Failed to load public-config.json:', error);
}

// --- CORS Configuration ---
const corsOptions = {
    origin: isProduction ? process.env.FRONTEND_URL : '*', // Use FRONTEND_URL from .env or '*' for dev
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
    optionsSuccessStatus: 204
};
app.use(cors(corsOptions));
app.use(express.json()); // Enable JSON body parsing for POST requests

// --- API Endpoints ---

// Calendar Events API Endpoint
app.post('/api/calendars/events', async (req, res) => {
    const { calendarUrls, timezone, daysPast, daysFuture } = req.body;
    if (!Array.isArray(calendarUrls)) {
        return res.status(400).json({ error: 'Invalid request body, expected array of URLs.' });
    }
    if (!timezone) {
        return res.status(400).json({ error: 'Invalid request body, expected timezone.' });
    }

    const clientNow = DateTime.now().setZone(timezone); // Convert current time to client's timezone
    // Pass the full Luxon DateTime object to the calendar service.
    // Converting to a JS Date object (`.toJSDate()`) loses the crucial timezone information,
    // which causes incorrect calculations for recurring events across DST boundaries.
    // The calendar service needs the full timezone context to work correctly.
    const startDate = clientNow.minus({ days: daysPast || 90 }).startOf('day');
    const endDate = clientNow.plus({ days: daysFuture || 180 }).endOf('day');

    try {
        // Enrich URLs with type and credentials from server config
        const calendarConfigs = calendarUrls.map(url => {
            const match = serverConfig?.calendars?.find(c => c.url === url);
            return match
                ? { url, type: match.type || 'ics', username: match.username, password: match.password }
                : { url, type: 'ics' };
        });

        const { events, errors } = await getCalendarEventsFromUrls(calendarConfigs, timezone, startDate, endDate);
        const response = {
            events,
            calendars: calendarUrls // Include calendar count for client to calculate success count
        };
        if (errors && errors.length > 0) {
            response.errors = errors;
        }
        res.json(response);
    } catch (error) {
        console.error('Error fetching calendar events:', error);
        // Provide a generic error message in production for security
        const errorMessage = isProduction ? 'Failed to fetch calendar events.' : error.message;
        res.status(500).json({ error: errorMessage });
    }
});

// Weather API Endpoint
app.get('/api/weather', async (req, res) => {
    try {
        const weatherForecast = await getCachedOrFreshWeather();
        res.json(weatherForecast);
    } catch (error) {
        console.error('Error fetching weather in API endpoint:', error);
        // Provide a generic error message in production for security
        const errorMessage = isProduction ? 'Failed to retrieve weather data.' : error.message;
        res.status(500).json({ message: errorMessage });
    }
});

app.get('/api/config', async (req, res) => {
    try {
        const config = serverConfig ? JSON.parse(JSON.stringify(serverConfig)) : {};

        // Ensure styleSettings exist with proper defaults
        if (!config.styleSettings) {
            config.styleSettings = {};
        }
        config.styleSettings.showGarageDoorStatus = config.styleSettings.showGarageDoorStatus ?? false;
        config.styleSettings.showPrinterStatus = config.styleSettings.showPrinterStatus ?? false;
        config.styleSettings.showWeatherInLegend = config.styleSettings.showWeatherInLegend ?? false;

        // Strip sensitive fields from calendars before sending to client
        if (config.calendars) {
            config.calendars = config.calendars.map(cal => {
                const safe = { ...cal };
                delete safe.username;
                delete safe.password;
                delete safe.comment;
                return safe;
            });
        }

        // Add server-side configuration
        config.printerRefreshIntervalSeconds = parseInt(process.env.OCTOPRINT_REFRESH_INTERVAL_SECONDS) || 60;

        res.json(config);
    } catch (error) {
        console.error('Failed to load public-config.json:', error);
        res.status(500).json({ error: 'Failed to load server configuration.' });
    }
});

// OctoPrint Status API Endpoint
app.get('/api/octoprint/status', async (req, res) => {
    try {
        const status = await getOctoPrintStatus();
        res.json(status);
    } catch (error) {
        console.error('Error fetching OctoPrint status in API endpoint:', error);
        const errorMessage = isProduction ? 'Failed to retrieve printer status.' : error.message;
        res.status(500).json({ error: errorMessage });
    }
});

// Garage Door State API Endpoint
app.get('/api/garage/door/state', async (req, res) => {
    try {
        const state = await getGarageDoorState();
        res.json(state);
    } catch (error) {
        console.error('Error fetching garage door state in API endpoint:', error);
        const errorMessage = isProduction ? 'Failed to retrieve garage door state.' : error.message;
        res.status(500).json({ error: errorMessage });
    }
});

// Version API Endpoint
app.get('/api/version', (req, res) => {
    try {
        const packageJsonPath = path.join(__dirname, 'package.json');
        const packageData = fs.readFileSync(packageJsonPath, 'utf-8');
        const { version, buildNumber } = JSON.parse(packageData);
        res.json({ version, buildNumber });
    } catch (error) {
        console.error('Error loading version:', error);
        res.status(500).json({ error: 'Failed to retrieve version.' });
    }
});

// --- Static File Serving for Production ---
if (isProduction) {
    // Assumes your client's production build output is in a 'client/build' directory
    // relative to your server.js file.
    const buildPath = path.join(__dirname, 'client', 'build');
    app.use(express.static(buildPath));

    // For any other GET request, serve the React app's index.html
    app.get('/{*any}', (req, res) => {
        res.sendFile(path.join(buildPath, 'index.html'));
    });
}

// --- Start Server ---
app.listen(PORT, () => {
    // This log is now redundant with the initial console.log, but kept for clarity
    // of the server starting *after* all setup.
    // You can remove this if the initial log is sufficient.
    console.log(`Server started successfully on port ${PORT}.`);
});