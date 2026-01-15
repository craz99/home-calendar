import ical from 'node-ical';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { DateTime } from 'luxon';

import pkg from 'rrule';
const { RRule, RRuleSet, rrulestr } = pkg;

const CACHE_DIR = './cache';
const CACHE_TTL_MS = 1000 * 60 * 20; // 20 minutes

async function getCachedData(url) {
    const hash = crypto.createHash('md5').update(url).digest('hex');
    const filePath = path.join(CACHE_DIR, `${hash}.ics`);

    try {
        const stat = await fs.stat(filePath);
        if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
            return await fs.readFile(filePath, 'utf-8');
        }
    } catch {
        // Cache miss or expired
    }
    // --- MODIFIED LOG ---
    console.log("Cache miss for URL hash:", hash);
    const response = await axios.get(url);
    let data = response.data;

    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        await fs.writeFile(filePath, data);
    } catch (err) {
        // --- MODIFIED LOG ---
        console.warn(`Failed to write cache for URL hash: ${hash}:`, err);
    }

    return data;
}

function adjustEndForAllDayEvents(item) {
    const { end, datetype } = item;
    // Use the `datetype` property from node-ical for reliable all-day event detection.
    const isAllDay = datetype === 'date';
    if (isAllDay) {
        // For all-day events, the `end` date is exclusive. Subtract 1ms to get the inclusive end time.
        return new Date(end.getTime() - 1);
    }
    return end;
}

/**
 * Parses an ICS data string to extract calendar events within a given date range.
 * This is a pure function, making it suitable for unit testing.
 *
 * @param {string} icsData - The raw ICS data string.
 * @param {string} timezone - The target timezone (e.g., 'America/New_York').
 * @param {Date} startRange - The start of the date range.
 * @param {Date} endRange - The end of the date range.
 * @param {string} url - The original URL of the calendar feed, for context.
 * @returns {Array<object>} An array of event objects.
 */
export function parseIcsData(icsData, timezone, startRange, endRange, url) {
    const allEvents = [];
    const parsedData = ical.parseICS(icsData);

    for (const k in parsedData) {
        const item = parsedData[k];
        if (item.type === 'VEVENT') {
            const itemStart = item.start; // The *correct* event start time
            const adjustedEnd = adjustEndForAllDayEvents(item);

            // The complex RRULE transformation causes issues with annual all-day events.
            // By checking for `datetype`, we only apply this complex logic to timed recurring events,
            // letting the simpler logic handle all-day events correctly.
            if (item.rrule && item.datetype !== 'date') {
                const rruleSet = new RRuleSet();

                // 1. Get the correct UTC start time (e.g., 2025-10-22T00:30:00.000Z)
                const correctUtcStart = item.start;

                // 2. Get the original RRULE string (e.g., ...RRULE:FREQ=WEEKLY;BYDAY=TU)
                const originalRuleString = item.rrule.toString();
                const rruleLine = originalRuleString.split('\n').find(line => line.startsWith('RRULE:'));

                // 3. Create a new, 100% UTC DTSTART string
                //    e.g., "DTSTART:20251022T003000Z"
                const dtStartString = DateTime.fromJSDate(correctUtcStart, { zone: 'utc' })
                    .toFormat("'DTSTART:'yyyyMMdd'T'HHmmss'Z'");

                // 4. Create a new, 100% UTC RRULE line
                if (rruleLine) {
                    // Get the correct UTC day (1=Mon, 3=Wed)
                    const correctUtcDay = DateTime.fromJSDate(correctUtcStart, { zone: 'utc' }).toFormat('c');
                    // Convert to the 2-letter code (e.g., "WE")
                    const rruleDayCode = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'][correctUtcDay - 1];

                    // Replace the old local day (e.g., BYDAY=TU) with the new UTC day (e.g., BYDAY=WE)
                    const newRRuleLine = rruleLine.replace(/BYDAY=[A-Z,]+/, `BYDAY=${rruleDayCode}`);

                    // 5. Combine them into a new, conflict-free rule
                    const newRuleText = `${dtStartString}\n${newRRuleLine}`;

                    // 6. Parse the new rule string. This has no TZID and is pure UTC.
                    const rule = rrulestr(newRuleText);
                    rruleSet.rrule(rule);

                } else {
                    // Fallback in case there's no RRULE line (e.g., RDATE only)
                    const rule = item.rrule;
                    rule.options.dtstart = correctUtcStart;
                    rule.options.tzid = null;
                    rruleSet.rrule(rule);
                }

                // EXDATE handling is deferred until after wall time correction
                // because the rrule generates dates in UTC, but EXDATE needs to match
                // against the wall-time-corrected occurrences (to handle DST properly).
                // We'll store the EXDATEs and filter them out after applying wall time correction.
                const exdateDatesSet = new Set();
                if (item.exdate) {
                    Object.values(item.exdate).forEach(ex => {
                        // Store the date (without time) that should be excluded
                        const exDateOnly = DateTime.fromJSDate(ex, { zone: 'utc' })
                            .setZone(timezone)
                            .toISODate();
                        exdateDatesSet.add(exDateOnly);
                    });
                }

                const modifiedRecurrenceIds = new Set();

                if (item.recurrences) {
                    for (const recurrenceId in item.recurrences) {
                        const recurrence = item.recurrences[recurrenceId];
                        modifiedRecurrenceIds.add(new Date(recurrence.recurrenceid).getTime());

                        const recurrenceStart = new Date(recurrence.start);
                        const recurrenceEnd = new Date(recurrence.end);

                        if (recurrenceStart >= startRange && recurrenceStart <= endRange) {
                            allEvents.push({
                                title: recurrence.summary || item.summary,
                                description: recurrence.description || item.description,
                                location: recurrence.location || item.location,
                                start: recurrenceStart,
                                end: recurrenceEnd,
                                calendarUrl: url
                            });
                        }
                    }
                }

                const duration = adjustedEnd.getTime() - itemStart.getTime();

                const nextOccurrence = rruleSet.after(startRange, true);
                if (!nextOccurrence || nextOccurrence > endRange) {
                    // The event’s recurrence series ended before our range — skip it
                    continue;
                }

                // Generate the *days* from the rrule. These are already correct
                // JS Date objects (UTC timestamps).
                const dates = rruleSet.between(startRange, endRange);

                dates.forEach(date => {
                    if (modifiedRecurrenceIds.has(date.getTime())) {
                        return;
                    }

                    // --- DST FIX & ROBUST TIME HANDLING ---
                    // The original `item.start` has the correct local "wall time" we want to preserve (e.g., 8:30 PM).
                    const originalWallTime = DateTime.fromJSDate(item.start, { zone: timezone });

                    // `date` is the UTC-based occurrence from the rrule logic.
                    // We use it for the date part, but force the time part to match the original event's wall time.
                    // `keepLocalTime: true` is the key: it recalculates the UTC offset for the new date.
                    const correctedStart = DateTime.fromJSDate(date, { zone: timezone })
                        .set({ hour: originalWallTime.hour, minute: originalWallTime.minute, second: originalWallTime.second })
                        .setZone(timezone, { keepLocalTime: true });

                    // Check if this occurrence is in the EXDATE list
                    const correctedDateOnly = correctedStart.toISODate();
                    if (exdateDatesSet.has(correctedDateOnly)) {
                        return; // Skip this occurrence
                    }

                    const correctedEnd = correctedStart.plus({ milliseconds: duration });

                    allEvents.push({
                        title: item.summary,
                        start: correctedStart.toJSDate(),
                        end: correctedEnd.toJSDate(),
                        allDay: false,
                        calendarUrl: url
                    });
                });
            } else if (item.rrule) { // Simpler path for recurring ALL-DAY events
                // The object from node-ical is inconsistent. The most robust way to handle this
                // is to build a new, clean options object from the parsed data.
                let parsedRule = item.rrule.options || item.rrule.origOptions || {};
                if (!parsedRule.freq) {
                    // Try to recover from RRULE string if the parser didn’t populate .options
                    // This is more robust than just a regex for FREQ.
                    const rruleText = item.rrule.toString();
                    rruleText.replace('RRULE:', '').split(';').forEach(part => {
                        const [key, value] = part.split('=');
                        if (key === 'FREQ') {
                            parsedRule.freq = RRule[value];
                        } else if (key === 'COUNT') {
                            parsedRule.count = parseInt(value, 10);
                        } else if (key === 'UNTIL') {
                            // The UNTIL date is usually in ISO format, parse it into a Date object.
                            parsedRule.until = DateTime.fromISO(value).toJSDate();
                        } else if (key === 'INTERVAL') {
                            parsedRule.interval = parseInt(value, 10);
                        }
                    });
                }

                const ruleOptions = {
                    freq: parsedRule.freq,
                    dtstart: item.start,
                    ...(parsedRule.byweekday && { byweekday: parsedRule.byweekday }),
                    ...(parsedRule.bymonthday && { bymonthday: parsedRule.bymonthday }),
                    ...(parsedRule.bymonth && { bymonth: parsedRule.bymonth }), // add bymonth support
                    ...(parsedRule.count && { count: parsedRule.count }),
                    ...(parsedRule.interval && { interval: parsedRule.interval }),
                    ...(parsedRule.until && { until: parsedRule.until }),
                };

                // --- START: Fix for faulty annual RRULE ---
                // If the rule is yearly but doesn't specify a month, it will repeat every month.
                // We correct this by adding the month from the original start date.
                if (ruleOptions.freq === RRule.YEARLY && !ruleOptions.bymonth) {
                    ruleOptions.bymonth = [item.start.getMonth() + 1]; // getMonth() is 0-indexed
                }
                // --- END: Fix for faulty annual RRULE ---
                if (ruleOptions.freq === undefined || ruleOptions.freq === null) {
                    console.warn("⚠️ Missing freq in RRULE for event:", item.summary, item.rrule.toString());
                }

                const rule = new RRuleSet();
                rule.rrule(new RRule(ruleOptions));

                // Handle EXDATE for all-day recurring events
                const exdateDatesSet = new Set();
                if (item.exdate) {
                    Object.values(item.exdate).forEach(ex => {
                        // Store the date (without time) that should be excluded
                        const exDateOnly = DateTime.fromJSDate(ex, { zone: timezone })
                            .toISODate();
                        exdateDatesSet.add(exDateOnly);
                    });
                }

                const nextOccurrence = rule.after(startRange, true);
                if (!nextOccurrence || nextOccurrence > endRange) {
                    // The event's recurrence series ended before our range — skip it
                    continue;
                }
                // For all-day events, we need to expand the search range to account for timezone
                // differences. An event at Nov 1 00:00 UTC is Nov 1 in UTC timezone, but if the
                // query range is Nov 1 00:00 EST (= Nov 1 05:00 UTC), the event would be excluded.
                // We expand the range by 24 hours on each side to catch these edge cases.
                const expandedStart = new Date(startRange.getTime() - 24 * 60 * 60 * 1000);
                const expandedEnd = new Date(endRange.getTime() + 24 * 60 * 60 * 1000);
                const dates = rule.between(expandedStart, expandedEnd);
                dates.forEach(date => {
                    // RRule generates dates in UTC. For all-day events, we need to treat the
                    // UTC date components as the actual calendar date in the target timezone
                    const utcOccurrence = DateTime.fromJSDate(date, { zone: 'utc' });
                    const localOccurrence = DateTime.fromObject({
                        year: utcOccurrence.year,
                        month: utcOccurrence.month,
                        day: utcOccurrence.day,
                        hour: 0,
                        minute: 0,
                        second: 0
                    }, { zone: timezone });

                    // Since we expanded the search range, we need to filter to only include
                    // events that are actually within the requested range
                    if (localOccurrence.toJSDate() < startRange || localOccurrence.toJSDate() > endRange) {
                        return;
                    }

                    const eventDateOnly = localOccurrence.toISODate();

                    // Skip if this date is in the EXDATE list
                    if (exdateDatesSet.has(eventDateOnly)) {
                        return;
                    }

                    // Calculate the duration from the original event
                    const duration = item.end.getTime() - item.start.getTime();

                    allEvents.push({
                        title: item.summary,
                        start: localOccurrence.toJSDate(),
                        end: new Date(localOccurrence.toMillis() + duration),
                        allDay: true,
                        calendarUrl: url
                    });
                });
            } else {
                // Non-recurring event
                const isAllDay = item.datetype === 'date';
                if (isAllDay && itemStart < adjustedEnd) {
                    // This is a multi-day or single-day all-day event.
                    // Split it into individual day events for the client.
                    let currentDay = DateTime.fromJSDate(itemStart, { zone: timezone }).startOf('day');
                    const lastDay = DateTime.fromJSDate(adjustedEnd, { zone: timezone }).startOf('day');

                    while (currentDay.toMillis() <= lastDay.toMillis()) {
                        // Only add days that fall within the requested range
                        if (currentDay.toJSDate() >= startRange && currentDay.toJSDate() <= endRange) {
                            const newEvent = {
                                title: item.summary,
                                start: currentDay.toJSDate(),
                                end: currentDay.endOf('day').toJSDate(),
                                allDay: true,
                                calendarUrl: url,
                            };
                            allEvents.push(newEvent);
                        }
                        currentDay = currentDay.plus({ days: 1 });
                    }
                } else if (itemStart < endRange && adjustedEnd > startRange) {
                    // This is the correct check for overlapping time ranges:
                    // (StartA < EndB) and (EndA > StartB)
                    // This is a single, non-recurring timed event.
                    allEvents.push({
                        title: item.summary,
                        description: item.description,
                        location: item.location,
                        start: itemStart,
                        end: adjustedEnd,
                        allDay: false,
                        calendarUrl: url
                    });
                }
            }
        }
    }
    return allEvents;
}

export async function getCalendarEventsFromUrls(urls, timezone = 'UTC', startDate, endDate) {
    const allEvents = [];

    // The core parsing logic now expects native Date objects.
    const startRange = startDate.toJSDate();
    const endRange = endDate.toJSDate();

    for (const url of urls) {
        const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 7);
        console.log(`Processing URL hash: ${urlHash}...`);

        const icsData = await getCachedData(url);
        const eventsFromUrl = parseIcsData(icsData, timezone, startRange, endRange, url);
        allEvents.push(...eventsFromUrl);
    }

    return allEvents;
}

function detectEvent(item) {
    // Placeholder for debugging specific events
    // Replace 'DEBUG_EVENT_NAME' with an event title to debug
    const DEBUG_EVENT_NAME = 'DEBUG_EVENT_NAME';
    if (item.summary && item.summary.toLowerCase().includes(DEBUG_EVENT_NAME.toLowerCase())) {
        // Uncomment for debugging
        // console.log("--- Detecting Event ---");
        // console.log("Event Start:", item.start);
        // console.log("RRULE String:", item.rrule?.toString());
        return true;
    }
    return false;
}
