import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import moment from 'moment';
import { loadEvents } from './utils/eventLoader.js';
import { loadWeather } from './utils/weatherLoader.js';
import { Container, Button, Alert, Row, Col } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import {
    // calendarConfig has been removed
    WORD_TO_ICON_MAP,
    REFRESH_INTERVAL_MINUTES,
    TIME_UPDATE_INTERVAL_SECONDS
} from './utils/calendarConfig.js';

const API_BASE_URL = process.env.NODE_ENV !== 'production' ? process.env.REACT_APP_API_BASE_URL : '';

// Add a map for weather conditions to Font Awesome icons
const WEATHER_ICON_MAP = new Map([
    ['clear', 'fa-sun'],
    ['clouds', 'fa-cloud'],
    ['rain', 'fa-cloud-showers-heavy'],
    ['drizzle', 'fa-cloud-rain'],
    ['thunderstorm', 'fa-bolt'],
    ['snow', 'fa-snowflake'],
    ['mist', 'fa-smog'],
    ['smoke', 'fa-smog'],
    ['haze', 'fa-smog'],
    ['dust', 'fa-smog'],
    ['fog', 'fa-smog'],
    ['sand', 'fa-smog'],
    ['ash', 'fa-smog'],
    ['squall', 'fa-wind'],
    ['tornado', 'fa-tornado'],
]);

// Helper to get icon for event title
const getIconForEvent = (title) => {
    const lowerCaseTitle = title.toLowerCase();
    for (const [word, iconClass] of WORD_TO_ICON_MAP.entries()) {
        if (lowerCaseTitle.includes(word)) {
            return <i className={`fas ${iconClass} me-1`}></i>;
        }
    }
    return null;
};

// Helper to get icon for weather
const getIconForWeather = (weatherMain) => {
    const lowerCaseWeather = weatherMain.toLowerCase();
    for (const [word, iconClass] of WEATHER_ICON_MAP.entries()) {
        if (lowerCaseWeather.includes(word)) {
            return <i className={`fas ${iconClass} me-1`}></i>;
        }
    }
    return <i className="fas fa-question me-1"></i>; // Default unknown icon
};

const capitalizeWords = (str) => {
    if (!str) return '';
    return str.split(' ').map(word => {
        if (word.length === 0) return '';
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
};

// --- NEW NATIVE DATE FORMATTER ---
// Helper to format native Date object
const formatNativeDate = (date) => {
    try {
        const day = date.toLocaleDateString(undefined, { weekday: 'long' });
        const month = date.toLocaleDateString(undefined, { month: 'long' });
        const dayNum = date.getDate();
        const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

        // This format is very close to moment's "dddd MMMM Do, h:mm A"
        return `${day} ${month} ${dayNum}, ${time}`;
    } catch (e) {
        console.error("Native date formatting failed:", e);
        // Fallback for very old/broken browsers
        return date.toString();
    }
};

// --- MODIFIED HELPER FUNCTIONS ---

// Helper to check if a moment date is today (using a native Date)
const isToday = (momentDate, todayDate) => {
    // Compare date parts
    return momentDate.year() === todayDate.getFullYear() &&
        momentDate.month() === todayDate.getMonth() && // moment month is 0-11
        momentDate.date() === todayDate.getDate();
};

// Helper to check if a moment date is before today (using a native Date)
const isBeforeToday = (momentDate, todayDate) => {
    // Create a native Date at the start of today
    const todayStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
    // Compare if the moment date is before that timestamp
    return momentDate.clone().startOf('day').isBefore(todayStart.getTime());
};


// --- Main App Component ---
const App = () => {
    // --- ADD NEW STATE FOR CONFIG ---
    const [appConfig, setAppConfig] = useState(null); // Will hold { calendars: [], styleSettings: {} }

    const [events, setEvents] = useState([]);
    const [weatherForecast, setWeatherForecast] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [startDate, setStartDate] = useState(moment().startOf('isoWeek'));

    // --- MODIFIED STATE INITIALIZATION ---
    const [currentTimeDisplay, setCurrentTimeDisplay] = useState(() => formatNativeDate(new Date()));
    const [currentRealTime, setCurrentRealTime] = useState(() => new Date());
    const logicalDateRef = useRef(moment().add(4, 'hours'));

    // --- ADD NEW EFFECT TO FETCH CONFIG ---
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                // Assuming the server serves config at /api/config
                const response = await fetch(`${API_BASE_URL}/api/config`);
                if (!response.ok) {
                    throw new Error('Failed to load configuration from server');
                }
                const configData = await response.json();
                setAppConfig(configData);
                // Set document title from config
                if (configData.appTitle) {
                    document.title = configData.appTitle;
                }
            } catch (err) {
                console.error("Error fetching config:", err);
                setError(`Failed to load app configuration: ${err.message}`);
            }
        };
        fetchConfig();
    }, []); // Runs once on mount

    // --- OCTOPRINT STATUS LOADING ---
    const loadPrinterStatus = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/octoprint/status`);
            if (!response.ok) {
                throw new Error('Failed to fetch printer status');
            }
            const status = await response.json();
            setPrinterStatus(status);
        } catch (err) {
            console.error('Error loading printer status:', err);
            // Keep the current state on error
        }
    };

    // --- GARAGE DOOR STATUS LOADING ---
    const loadGarageDoorStatus = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/garage/door/state`);
            if (!response.ok) {
                throw new Error('Failed to fetch garage door status');
            }
            const data = await response.json();
            // Set to true if state is "OPEN", false otherwise
            setGarageDoorOpen(data.state === 'OPEN');
        } catch (err) {
            console.error('Error loading garage door status:', err);
            // Keep the current state on error
        }
    };

    // --- MODIFY DATA FETCHING EFFECT ---
    useEffect(() => {
        // --- ADD THIS CHECK ---
        if (!appConfig) {
            return; // Don't fetch data until config is loaded
        }

        const fetchAllData = async () => {
            setLoading(true);
            setError(null);

            try {
                // --- GET URLs FROM CONFIG STATE ---
                const calendarUrls = appConfig.calendars.map(c => c.url);

                // --- PASS URLs TO loadEvents ---
                // loadEvents now returns the events instead of setting state directly.
                const fetchedEvents = await loadEvents(calendarUrls);
                const weatherPromise = loadWeather(setWeatherForecast); // Weather is not filtered
                await Promise.all([weatherPromise]); // Await weather (printer has its own refresh cycle)

                setEvents(fetchedEvents);
            } catch (err) {
                console.error("Error during data fetch coordination:", err);
                setError(`Failed to load data: ${err.message || 'An unexpected error occurred.'}`);
            } finally {
                setLoading(false);
            }
        };

        fetchAllData();
        const intervalId = setInterval(fetchAllData, REFRESH_INTERVAL_MINUTES * 60 * 1000);
        return () => clearInterval(intervalId);
        // --- UPDATE DEPENDENCY ARRAY ---
    }, [appConfig]); // This effect now runs when appConfig is loaded

    // --- MODIFIED TIME-UPDATE EFFECT ---
    useEffect(() => {
        const timerId = setInterval(() => {
            // --- START OF CHANGES ---
            const now = new Date(); // Use native Date
            // Use native Date math for 4 hours ahead
            const effectiveNowMoment = moment(now.getTime() + 4 * 60 * 60 * 1000);

            setCurrentTimeDisplay(formatNativeDate(now)); // Use new formatter
            setCurrentRealTime(now); // Set native Date
            // --- END OF CHANGES ---

            const prevLogicalDate = logicalDateRef.current;
            const previousLogicalWeek = prevLogicalDate.isoWeek();
            const currentLogicalWeek = effectiveNowMoment.isoWeek(); // Use the moment version for week logic

            if (previousLogicalWeek !== currentLogicalWeek) {
                setStartDate(prevStartDate => {
                    const displayedTopRowWeekStart = prevStartDate.clone().startOf('isoWeek');
                    const previousMomentWeekStart = prevLogicalDate.clone().startOf('isoWeek');

                    if (displayedTopRowWeekStart.isSame(previousMomentWeekStart, 'day')) {
                        return effectiveNowMoment.clone().startOf('isoWeek'); // Use moment version
                    }
                    return prevStartDate;
                });
            }
            logicalDateRef.current = effectiveNowMoment; // Use moment version

        }, TIME_UPDATE_INTERVAL_SECONDS * 1000);

        return () => clearInterval(timerId);
    }, []);

    const daysOfWeek = useMemo(() => {
        const defaultDays = moment.weekdays();
        return defaultDays.slice(1).concat(defaultDays.slice(0, 1));
    }, []);

    // --- GET STYLE SETTINGS FROM CONFIG (moved before useEffect that needs them) ---
    const showGarageDoorStatus = appConfig?.styleSettings?.showGarageDoorStatus ?? false;
    const showPrinterStatus = appConfig?.styleSettings?.showPrinterStatus ?? false;
    const printerRefreshIntervalSeconds = appConfig?.printerRefreshIntervalSeconds || 60;

    // --- PRINTER STATUS REFRESH EFFECT ---
    useEffect(() => {
        if (!appConfig || !showPrinterStatus) {
            return; // Don't fetch if config not loaded or printer status disabled
        }

        // Initial fetch
        loadPrinterStatus();

        // Set up interval for regular refreshes
        const intervalId = setInterval(loadPrinterStatus, printerRefreshIntervalSeconds * 1000);
        return () => clearInterval(intervalId);
    }, [appConfig, showPrinterStatus, printerRefreshIntervalSeconds]);

    // --- GARAGE DOOR STATUS REFRESH EFFECT ---
    useEffect(() => {
        if (!appConfig || !showGarageDoorStatus) {
            return; // Don't fetch if config not loaded or garage door status disabled
        }

        // Initial fetch
        loadGarageDoorStatus();

        // Set up interval for regular refreshes (check every 10 seconds)
        const intervalId = setInterval(loadGarageDoorStatus, 10000);
        return () => clearInterval(intervalId);
    }, [appConfig, showGarageDoorStatus]);

    const calendarWeeks = useMemo(() => {
        const weeks = [];
        let currentDateIterator = startDate.clone();
        const numberOfWeeks = 2;

        for (let i = 0; i < numberOfWeeks; i++) {
            const week = [];
            for (let j = 0; j < 7; j++) {
                const day = currentDateIterator.clone();
                const eventsOnDay = events.filter(event => {
                    const eventStart = moment(event.start);
                    const eventEnd = moment(event.end);
                    const dayStart = day.clone().startOf('day');
                    const dayEnd = day.clone().endOf('day');

                    // For all-day events, the end time is exclusive (start of the next day).
                    // The check must be strictly `isAfter` to prevent the event from appearing on the next day's cell.
                    const endsOnOrAfterDayStart = event.allDay ? eventEnd.isAfter(dayStart) : eventEnd.isSameOrAfter(dayStart);

                    return eventStart.isSameOrBefore(dayEnd) && endsOnOrAfterDayStart;
                });

                // --- ADD COLORS BACK TO EVENTS ---
                // We do this here so we can access the appConfig
                const eventsWithColors = eventsOnDay.map(event => {
                    if (event.isWeather) return event; // Weather events already have color

                    // Find the calendar config for this event's URL
                    const calendar = appConfig?.calendars.find(
                        c => c.url === event.calendarUrl
                    );
                    const color = calendar?.color || '#a0a0a0'; // Default color

                    return {
                        ...event,
                        backgroundColor: color,
                        borderColor: color,
                        textColor: '#ffffff', // You can customize this
                    };
                });
                // --- END OF COLOR LOGIC ---

                const weatherForDay = weatherForecast.find(forecast =>
                    moment.unix(forecast.dt).isSame(day, 'day')
                );
                if (weatherForDay) {
                    eventsWithColors.unshift({ // <-- Use eventsWithColors
                        id: `weather-${day.format('YYYY-MM-DD')}`,
                        title: capitalizeWords(weatherForDay.weather[0].description),
                        start: day.clone().startOf('day').toISOString(),
                        end: day.clone().endOf('day').toISOString(),
                        isWeather: true,
                        weatherData: weatherForDay,
                        backgroundColor: '#e0f7fa',
                        textColor: '#00796b',
                        borderColor: '#00bcd4',
                    });
                }

                // --- USE THE NEW eventsWithColors ARRAY ---
                eventsWithColors.sort((a, b) => {
                    if (a.isWeather && !b.isWeather) return -1;
                    if (!a.isWeather && b.isWeather) return 1;
                    return new Date(a.start) - new Date(b.start);
                });

                week.push({ date: day, events: eventsWithColors }); // <-- Use eventsWithColors
                currentDateIterator.add(1, 'day');
            }
            weeks.push(week);
        }
        return weeks;
        // --- ADD appConfig AS A DEPENDENCY ---
    }, [startDate, events, weatherForecast, appConfig]);

    const handleNextWeek = useCallback(() => {
        setStartDate(prevDate => prevDate.clone().add(1, 'week'));
    }, []);



    const handlePrevWeek = useCallback(() => {
        setStartDate(prevDate => prevDate.clone().subtract(1, 'week'));
    }, []);

    const displayEndDate = calendarWeeks.length > 0
        ? calendarWeeks[calendarWeeks.length - 1][6].date
        : startDate;

    // --- GET OTHER STYLE SETTINGS FROM CONFIG ---
    // Use optional chaining and provide a default
    const eventTitleLines = appConfig?.styleSettings?.eventTitleLines || 2;
    const showWeatherInLegend = appConfig?.styleSettings?.showWeatherInLegend ?? true;

    // --- STATUS INDICATORS ---
    const [garageDoorOpen, setGarageDoorOpen] = useState(false); // false = closed (▼ green), true = open (▲ red)
    const [printerStatus, setPrinterStatus] = useState({
        printing: false,
        progress: 0,
        fileName: null,
        enabled: false
    });

    return (
        // --- ADD THE CSS VARIABLE TO THE CONTAINER ---
        <Container
            fluid
            className="agenda-container d-flex flex-column"
            style={{ '--event-title-lines': eventTitleLines }}
        >
            <Row className="align-items-center mb-3">
                <Col>
                    <h1 className="agenda-header">{currentTimeDisplay}</h1>
                </Col>
                <Col xs="auto" className="d-flex align-items-center gap-2">
                    {(showGarageDoorStatus || showPrinterStatus) && (
                        <div className="status-indicators d-flex align-items-center gap-2">
                            {showGarageDoorStatus && (
                                <div className="status-item d-flex align-items-center">
                                    <span className="me-1">Garage:</span>
                                    <i
                                        className={`fas ${garageDoorOpen ? 'fa-arrow-up-long' : 'fa-arrow-down-long'}`}
                                        style={{
                                            fontSize: '1.5rem',
                                            color: garageDoorOpen ? 'red' : 'green'
                                        }}
                                        title={garageDoorOpen ? 'Open' : 'Closed'}
                                    ></i>
                                </div>
                            )}
                            {showPrinterStatus && printerStatus.enabled && (
                                <div className="status-item d-flex align-items-center">
                                    <span className="me-1">Printer:</span>
                                    {printerStatus.printing ? (
                                        <span className="status-text" title={printerStatus.fileName || 'Printing'}>
                                            {printerStatus.progress}%
                                        </span>
                                    ) : (
                                        <div
                                            className="status-bubble"
                                            style={{ backgroundColor: 'gray' }}
                                            title="Idle"
                                        ></div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <div className="calendar-legend-container">
                        <ul className="list-unstyled d-flex flex-wrap mb-0">
                            {appConfig && appConfig.calendars.map(calendar => (
                                <li key={calendar.url} className="d-flex align-items-center me-1 mb-0">
                                    <div
                                        className="legend-color-box me-1 rounded"
                                        style={{ backgroundColor: calendar.color }}
                                    ></div>
                                    <span>{calendar.name}</span>
                                </li>
                            ))}
                            {showWeatherInLegend && (
                                <li className="d-flex align-items-center me-1 mb-0">
                                    <div
                                        className="legend-color-box me-1 rounded"
                                        style={{ backgroundColor: '#e0f7fa' }}
                                    ></div>
                                    <span>Weather</span>
                                </li>
                            )}
                        </ul>
                    </div>
                    <div className="d-flex align-items-center ms-2">
                        <Button variant="outline-primary" size="sm" className="me-1 px-2 py-1" onClick={handlePrevWeek}>Prev</Button>
                        <span className="week-range-text mx-1">
                            {startDate.format('MMM D')} - {displayEndDate.format('MMM D')}
                        </span>
                        <Button variant="outline-primary" size="sm" className="ms-1 px-2 py-1" onClick={handleNextWeek}>Next</Button>
                    </div>
                </Col>
                <Col xs="auto" className="text-end">
                    {loading && <Alert variant="info" className="p-2 mb-0 d-inline-block"><i className="fas fa-spinner fa-spin me-2"></i> Loading...</Alert>}
                    {error && !loading && <Alert variant="danger" onClose={() => setError(null)} dismissible className="p-2 mb-0 d-inline-block"><i className="fas fa-exclamation-triangle me-2"></i> {error}</Alert>}
                </Col>
            </Row>

            <div className="agenda-scroll-wrapper">
                <div className="agenda-grid">
                    {daysOfWeek.map(day => (
                        <div key={day} className="day-header text-center p-2 border">{day}</div>
                    ))}
                    {calendarWeeks.map((week) => (
                        week.map(dayData => (
                            <div
                                key={dayData.date.format('YYYY-MM-DD')}
                                // --- USE MODIFIED HELPER FUNCTIONS ---
                                className={`day-cell p-2 border d-flex flex-column ${isToday(dayData.date, currentRealTime) ? 'today' : isBeforeToday(dayData.date, currentRealTime) ? 'past' : ''}`}
                            >
                                <div className="date text-muted small mb-1">{dayData.date.format('D')}</div>
                                <ul className="events list-unstyled p-0 m-0">
                                    {dayData.events.map(event => (
                                        <li
                                            key={event.id || `${event.title}-${event.start}`}
                                            className="event-item rounded p-1 mb-1"
                                            style={{
                                                '--event-color': event.backgroundColor,
                                                color: event.textColor,
                                                borderColor: event.borderColor,
                                            }}
                                            title={event.description || event.title}
                                        >
                                            <div className="event-item-content-wrapper" style={{ backgroundColor: '#fff' }}>
                                                <div className="event-title-clamp">
                                                    {event.isWeather ? getIconForWeather(event.weatherData.weather[0].main) : getIconForEvent(event.title)}
                                                    {event.title}
                                                </div>
                                                {event.isWeather && (
                                                    <span className="event-time d-block">
                                                        High: {Math.round(event.weatherData.temp.max)}°F, Low: {Math.round(event.weatherData.temp.min)}°F
                                                    </span>
                                                )}
                                                {!event.isWeather && event.displayTime && (
                                                    <span className="event-time">{event.displayTime}</span>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))
                    ))}
                </div>
            </div>
        </Container>
    );
};

export default App;