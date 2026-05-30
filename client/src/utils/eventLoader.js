// src/utils/eventLoader.js
import moment from 'moment';
// No longer importing calendarConfig

// Base URL for API requests. Uses environment variable if available.
const API_BASE_URL = process.env.NODE_ENV !== 'production' ? process.env.REACT_APP_API_BASE_URL : '';

/**
 * Loads events from configured calendars and formats them.
 * It does NOT handle loading/error states; those are managed by the calling component.
 * @param {string[]} calendarUrls - An array of calendar URLs to fetch.
 * @returns {Promise<{events: Array, errors: Array}>} A promise that resolves with formatted events and any calendar errors.
 * @throws {Error} If the request itself fails (network error, 5xx response).
 */
export const loadEvents = async (calendarUrls) => {
    try {
        const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(`${API_BASE_URL}/api/calendars/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                calendarUrls: calendarUrls,
                timezone: userTimezone,
                daysPast: 90,
                daysFuture: 180,
            }),
        });

        if (!response.ok) {
            let errorDetails = `HTTP ${response.status}`;
            if (response.statusText) {
                errorDetails += ` - ${response.statusText}`;
            }
            try {
                const errorData = await response.json();
                if (errorData && errorData.error) {
                    errorDetails = errorData.error;
                }
            } catch (parseError) {
                console.warn('Could not parse error response JSON:', parseError);
            }
            throw new Error(`Failed to load events: ${errorDetails}`);
        }

        const data = await response.json();
        const formattedEvents = [];
        const events = data.events || [];
        const errors = data.errors || [];

        events.forEach((event, index) => {
            // The server now provides an `allDay` flag and pre-splits multi-day events.
            // The client logic can be greatly simplified.
            const eventId = event.id || `event-${event.start}-${event.end}-${event.title}-${index}`;
            const startMoment = moment(event.start);
            const endMoment = moment(event.end);

            formattedEvents.push({
                ...event, // Pass through server data like title, start, end, allDay, calendarUrl
                id: eventId,
                displayTime: event.allDay ? null : `${startMoment.format('h:mm A')} - ${endMoment.format('h:mm A')}`,
                extendedProps: { originalEvent: event },
            });
        });

        if (errors.length > 0) {
            console.warn('Calendar errors:', errors);
        }

        const successCount = data.calendars?.length - errors.length || 0;
        const totalCount = data.calendars?.length || '?';
        console.log(`Events loaded: ${formattedEvents.length} events (${successCount}/${totalCount} calendars succeeded${errors.length > 0 ? `, ${errors.length} failed` : ''})`);
        return { events: formattedEvents, errors };

    } catch (err) {
        console.error('Error in loadEvents utility:', err);
        throw err; // Re-throw so App.js's catch block can handle it
    }
};