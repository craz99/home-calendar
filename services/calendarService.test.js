import { parseIcsData } from './calendarService.js';
import { DateTime } from 'luxon';

// Helper to create a standard ICS file structure
const createIcs = (eventData) => `
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test Calendar//EN
${eventData}
END:VCALENDAR
`;

describe('calendarService', () => {
    const timezone = 'America/New_York';
    const url = 'http://fake.url/basic.ics';

    describe('parseIcsData', () => {
        it('should parse a single, non-recurring event', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241026T100000
DTEND;TZID=America/New_York:20241026T110000
SUMMARY:Single Event
UID:single-event
END:VEVENT
            `);

            const startRange = DateTime.fromISO('2024-10-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            expect(events).toHaveLength(1);
            expect(events[0].title).toBe('Single Event');
            // 2024-10-26T10:00:00-04:00 (EDT)
            expect(events[0].start.toISOString()).toBe('2024-10-26T14:00:00.000Z');
        });

        it('should parse an all-day event correctly', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20241027
DTEND;VALUE=DATE:20241028
SUMMARY:All Day Event
UID:allday-event
END:VEVENT
            `);
            const startRange = DateTime.fromISO('2024-10-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            expect(events).toHaveLength(1);
            // Start should be the beginning of the day in UTC
            expect(events[0].start.toISOString()).toBe('2024-10-27T04:00:00.000Z');
            // End should be adjusted to the very end of the day
            expect(events[0].end.toISOString()).toBe('2024-10-28T03:59:59.999Z');
        });

        it('should parse a multi-day all-day event correctly', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20241104
DTEND;VALUE=DATE:20241107
SUMMARY:Vacation
UID:multiday-allday-event
END:VEVENT
            `);
            const startRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-10T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // The server now splits multi-day all-day events into individual day events.
            // The event runs from Nov 4 to Nov 6, so we expect 3 separate events.
            expect(events).toHaveLength(3);

            // Check the first day
            expect(events[0].title).toBe('Vacation');
            expect(events[0].allDay).toBe(true);
            expect(events[0].start.toISOString()).toContain('2024-11-04');

            // Check that all 3 days are present
            const eventDates = events.map(e => DateTime.fromJSDate(e.start).toISODate());
            expect(eventDates).toEqual(['2024-11-04', '2024-11-05', '2024-11-06']);
        });

        describe('Recurring Events and DST', () => {
            // This RRULE creates an event every Tuesday at 8:30 PM New York time.
            // We will test one occurrence before the DST change (Oct 29, EDT, UTC-4)
            // and one after (Nov 5, EST, UTC-5).
            const recurringIcs = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241029T203000
DTEND;TZID=America/New_York:20241029T213000
SUMMARY:Recurring DST Event
RRULE:FREQ=WEEKLY;BYDAY=TU
UID:recurring-event
END:VEVENT
            `);

            const startRange = DateTime.fromISO('2024-10-28T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-06T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(recurringIcs, timezone, startRange, endRange, url);

            it('should generate correct number of recurring events', () => {
                expect(events).toHaveLength(2);
                expect(events[0].title).toBe('Recurring DST Event');
                expect(events[1].title).toBe('Recurring DST Event');
            });

            it('should handle time correctly before DST change (EDT)', () => {
                const eventBeforeDst = events.find(e => e.start.toISOString().startsWith('2024-10-30'));
                // Oct 29, 8:30 PM EDT (UTC-4) is Oct 30, 00:30 UTC
                expect(eventBeforeDst.start.toISOString()).toBe('2024-10-30T00:30:00.000Z');
            });

            it('should handle time correctly after DST change (EST)', () => {
                const eventAfterDst = events.find(e => e.start.toISOString().startsWith('2024-11-06'));
                // Nov 5, 8:30 PM EST (UTC-5) is Nov 6, 01:30 UTC
                expect(eventAfterDst.start.toISOString()).toBe('2024-11-06T01:30:00.000Z');
            });
        });

        describe('Recurring Events and Spring DST', () => {
            // In 2025, DST starts on March 9. An event at 2:30 AM will be affected.
            const recurringIcs = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20250308T023000
DTEND;TZID=America/New_York:20250308T033000
SUMMARY:Spring DST Event
RRULE:FREQ=DAILY;COUNT=3
UID:spring-dst-event
END:VEVENT
            `);
            const startRange = DateTime.fromISO('2025-03-07T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2025-03-11T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(recurringIcs, timezone, startRange, endRange, url);

            it.skip('should handle time correctly across the spring DST change', () => {
                expect(events).toHaveLength(3);
                // Mar 8, 2:30 AM EST is 07:30 UTC. Mar 10, 2:30 AM EDT is 06:30 UTC.
                // The logic should preserve the "wall time" of 2:30 AM.
                expect(events.every(e => e.start.getHours() === 7 || e.start.getHours() === 6)).toBe(true);
            });
        });

        it('should handle recurring events with exceptions (EXDATE)', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241101T090000
DTEND;TZID=America/New_York:20241101T100000
SUMMARY:Event with Exception
RRULE:FREQ=DAILY;COUNT=3
EXDATE;TZID=America/New_York:20241102T090000
UID:exdate-event
END:VEVENT
            `);
            const startRange = DateTime.fromISO('2024-10-30T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-05T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // Should generate events for Nov 1 and Nov 3, but skip Nov 2.
            expect(events).toHaveLength(2);
            const eventDates = events.map(e => DateTime.fromJSDate(e.start).toISODate());
            expect(eventDates).toContain('2024-11-01');
            expect(eventDates).not.toContain('2024-11-02');
            expect(eventDates).toContain('2024-11-03');
        });

        it('should handle modified occurrences of a recurring event', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241110T100000
DTEND;TZID=America/New_York:20241110T110000
SUMMARY:Original Event
RRULE:FREQ=DAILY;COUNT=3
UID:modified-event
END:VEVENT
BEGIN:VEVENT
RECURRENCE-ID;TZID=America/New_York:20241111T100000
DTSTART;TZID=America/New_York:20241111T123000
DTEND;TZID=America/New_York:20241111T130000
SUMMARY:Modified Event
UID:modified-event
END:VEVENT
            `);
            const startRange = DateTime.fromISO('2024-11-09T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-13T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            expect(events).toHaveLength(3);

            const originalEvent1 = events.find(e => DateTime.fromJSDate(e.start).toISODate() === '2024-11-10');
            const modifiedEvent = events.find(e => DateTime.fromJSDate(e.start).toISODate() === '2024-11-11');
            const originalEvent2 = events.find(e => DateTime.fromJSDate(e.start).toISODate() === '2024-11-12');

            expect(originalEvent1.title).toBe('Original Event');
            expect(modifiedEvent.title).toBe('Modified Event');
            expect(originalEvent2.title).toBe('Original Event');

            // Check that the modified event has the updated time
            // 2024-11-11T12:30:00-05:00 (EST)
            expect(modifiedEvent.start.toISOString()).toBe('2024-11-11T17:30:00.000Z');
        });

        it('should handle an annual recurring event', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20241208
DTEND;VALUE=DATE:20241209
SUMMARY:Annual Celebration
RRULE:FREQ=YEARLY
UID:annual-event
END:VEVENT
            `);
            // Check a range spanning multiple years
            const startRange = DateTime.fromISO('2024-01-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2026-01-01T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // Should find one event for 2024 and one for 2025
            expect(events).toHaveLength(2);

            const event2024 = events.find(e => e.start.getFullYear() === 2024);
            const event2025 = events.find(e => e.start.getFullYear() === 2025);

            expect(event2024.start.toISOString()).toContain('2024-12-08');
            expect(event2025.start.toISOString()).toContain('2025-12-08');
        });

        it('should handle a faulty annual event rule (missing BYMONTH)', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20241208
DTEND;VALUE=DATE:20241209
SUMMARY:Faulty Annual Event
RRULE:FREQ=YEARLY;BYMONTHDAY=8
UID:faulty-annual-event
END:VEVENT
            `);
            // Check a range spanning a few months around the event
            const startRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2025-02-01T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // It should find ONLY the December event, not one for every month.
            expect(events).toHaveLength(1);

            const eventDates = events.map(e => DateTime.fromJSDate(e.start).toFormat('yyyy-MM'));
            expect(eventDates).toContain('2024-12');
            expect(eventDates).not.toContain('2024-11');
            expect(eventDates).not.toContain('2025-01');
        });

        it('should handle a faulty annual all-day event correctly (like birthday)', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20071208
DTEND;VALUE=DATE:20071209
SUMMARY:Special Birthday
RRULE:FREQ=YEARLY;BYMONTHDAY=8
UID:special-birthday
END:VEVENT
            `);
            // Check a range in a future year
            const startRange = DateTime.fromISO('2025-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2026-02-01T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // It should find ONLY the December 2025 event.
            expect(events).toHaveLength(1);
            expect(events[0].start.toISOString()).toContain('2025-12-08');
        });

        it('should not include past recurring events with a COUNT', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20180713
DTEND;VALUE=DATE:20180714
SUMMARY:Expired Camp
RRULE:FREQ=WEEKLY;COUNT=6;INTERVAL=1
UID:expired-camp-event
END:VEVENT
            `);
            // Check a range far in the future
            const startRange = DateTime.fromISO('2024-01-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2025-01-01T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            expect(events).toHaveLength(0);
        });

        it('should handle a recurring event with an INTERVAL', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20241104
DTEND;VALUE=DATE:20241105
SUMMARY:Bi-weekly Meeting
RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3
UID:interval-event
END:VEVENT
            `);
            // Check a range that would normally have 5 Mondays
            const startRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-12-05T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // Should occur on Nov 4, Nov 18, Dec 2. Total of 3 occurrences.
            expect(events).toHaveLength(3);
            const eventDates = events.map(e => DateTime.fromJSDate(e.start).toISODate());
            expect(eventDates).toContain('2024-11-04');
            expect(eventDates).not.toContain('2024-11-11'); // Should be skipped
            expect(eventDates).toContain('2024-11-18');
        });

        it('should handle a recurring event with an UNTIL date', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20241125
DTEND;VALUE=DATE:20241126
SUMMARY:Limited Time Event
RRULE:FREQ=WEEKLY;UNTIL=20241210T045959Z
UID:until-event
END:VEVENT
            `);
            const startRange = DateTime.fromISO('2024-11-20T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-12-20T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // Should occur on Nov 25, Dec 2, Dec 9. Should NOT occur on Dec 16.
            expect(events).toHaveLength(3);
        });

        it('should include a timed event that starts before the range but ends within it', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241031T220000
DTEND;TZID=America/New_York:20241101T020000
SUMMARY:Halloween Party
UID:overlapping-event
END:VEVENT
            `);
            // Range starts on Nov 1
            const startRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-02T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // The event should be included because it's still active on Nov 1.
            expect(events).toHaveLength(1);
            expect(events[0].title).toBe('Halloween Party');
        });

        it('should only include events that are within the date range', () => {
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241015T100000
DTEND;TZID=America/New_York:20241015T110000
SUMMARY:Event Before Range
UID:before-event
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241115T100000
DTEND;TZID=America/New_York:20241115T110000
SUMMARY:Event After Range
UID:after-event
END:VEVENT
            `);
            // Range is Nov 1 to Nov 10
            const startRange = DateTime.fromISO('2024-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2024-11-10T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);

            // Neither event should be in the results
            expect(events).toHaveLength(0);
        });

        it('should handle empty or invalid ICS data gracefully', () => {
            const emptyIcs = createIcs('');
            const invalidIcs = 'this is not valid ics data';
            const startRange = new Date();
            const endRange = new Date();

            const eventsFromEmpty = parseIcsData(emptyIcs, timezone, startRange, endRange, url);
            const eventsFromInvalid = parseIcsData(invalidIcs, timezone, startRange, endRange, url);

            expect(eventsFromEmpty).toHaveLength(0);
            expect(eventsFromInvalid).toHaveLength(0);
        });

        describe('Recurring Events with Deleted Individual Instances', () => {
            it('should handle a recurring timed event with a single deleted instance in the middle', () => {
                const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241110T183000
DTEND;TZID=America/New_York:20241110T200000
SUMMARY:Hub 6:30 PM - 8:00 PM
RRULE:FREQ=WEEKLY;BYDAY=SU
EXDATE;TZID=America/New_York:20241117T183000
UID:hub-soccer-event
END:VEVENT
                `);
                const startRange = DateTime.fromISO('2024-11-09T00:00:00', { zone: timezone }).toJSDate();
                const endRange = DateTime.fromISO('2024-12-02T00:00:00', { zone: timezone }).toJSDate();

                const events = parseIcsData(icsData, timezone, startRange, endRange, url);

                // Should have 3 events: Nov 10, Nov 24, Dec 1 (Nov 17 is excluded via EXDATE)
                expect(events).toHaveLength(3);

                const eventDates = events.map(e => DateTime.fromJSDate(e.start).toISODate());
                expect(eventDates).toContain('2024-11-10');
                expect(eventDates).not.toContain('2024-11-17'); // This instance was deleted
                expect(eventDates).toContain('2024-11-24');
                expect(eventDates).toContain('2024-12-01');
            });

            it('should correctly handle the time for recurring events with deleted instances', () => {
                const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241110T183000
DTEND;TZID=America/New_York:20241110T200000
SUMMARY:Hub 6:30 PM - 8:00 PM
RRULE:FREQ=WEEKLY;BYDAY=SU
EXDATE;TZID=America/New_York:20241117T183000
UID:hub-soccer-event
END:VEVENT
                `);
                const startRange = DateTime.fromISO('2024-11-09T00:00:00', { zone: timezone }).toJSDate();
                const endRange = DateTime.fromISO('2024-12-02T00:00:00', { zone: timezone }).toJSDate();

                const events = parseIcsData(icsData, timezone, startRange, endRange, url);

                // All events should start at 6:30 PM EST (which is 23:30 UTC)
                // and end at 8:00 PM EST (which is 01:00 UTC next day)
                events.forEach(event => {
                    const startHour = event.start.getUTCHours();
                    const startMinute = event.start.getUTCMinutes();

                    // 6:30 PM EST = 23:30 UTC
                    expect(startHour).toBe(23);
                    expect(startMinute).toBe(30);

                    // Duration should be 1.5 hours (90 minutes)
                    const durationMs = event.end.getTime() - event.start.getTime();
                    const durationMinutes = durationMs / (1000 * 60);
                    expect(durationMinutes).toBe(90);
                });
            });

            it('should handle a recurring event where some instances are deleted and others are modified', () => {
                // Complex scenario: Some instances deleted via EXDATE, some modified via RECURRENCE-ID
                const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20241110T183000
DTEND;TZID=America/New_York:20241110T200000
SUMMARY:Hub 6:30 PM - 8:00 PM
RRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=4
EXDATE;TZID=America/New_York:20241124T183000
UID:hub-soccer-event
END:VEVENT
BEGIN:VEVENT
RECURRENCE-ID;TZID=America/New_York:20241117T183000
DTSTART;TZID=America/New_York:20241117T190000
DTEND;TZID=America/New_York:20241117T210000
SUMMARY:Hub 6:30 PM - 8:00 PM (Rescheduled)
UID:hub-soccer-event
END:VEVENT
                `);
                const startRange = DateTime.fromISO('2024-11-09T00:00:00', { zone: timezone }).toJSDate();
                const endRange = DateTime.fromISO('2024-12-08T00:00:00', { zone: timezone }).toJSDate();

                const events = parseIcsData(icsData, timezone, startRange, endRange, url);

                // Should have 3 events total:
                // Nov 10 - original time
                // Nov 17 - modified time (modified occurrence)
                // Dec 1 - original time (Nov 24 is excluded)
                expect(events).toHaveLength(3);

                const eventsByDate = {};
                events.forEach(e => {
                    const date = DateTime.fromJSDate(e.start).toISODate();
                    eventsByDate[date] = e;
                });

                expect(eventsByDate['2024-11-10']).toBeDefined();
                expect(eventsByDate['2024-11-17']).toBeDefined();
                expect(eventsByDate['2024-11-24']).toBeUndefined(); // Deleted via EXDATE
                expect(eventsByDate['2024-12-01']).toBeDefined();

                // Verify the modified instance has the new time (7:00 PM instead of 6:30 PM)
                const modifiedEvent = eventsByDate['2024-11-17'];
                expect(modifiedEvent.title).toBe('Hub 6:30 PM - 8:00 PM (Rescheduled)');
                // Nov 17, 7:00 PM EST = 00:00 UTC on Nov 18
                expect(modifiedEvent.start.toISOString()).toContain('2024-11-18T00:00:00');
            });

            it('should exclude deleted instances from a recurring event (ACTUAL BUG)', () => {
                // BUG: Real example from Sadie's calendar: Hub event on Nov 25, 2025 should be excluded
                // because it has EXDATE entry for that date, but it was showing up on the calendar.
                //
                // ICS data:
                //   DTSTART: Tuesday Sep 9, 2025 at 6:30 PM
                //   RRULE: FREQ=WEEKLY;UNTIL=20260524
                //   EXDATE: Nov 25, 2025 at 6:30 PM (this Tuesday should be deleted)
                //
                // Expected: Events on Nov 18 only (Nov 25 is excluded via EXDATE)
                // Actual: Returns both Nov 18 AND Nov 25 (EXDATE not being respected)
                const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;TZID=America/New_York:20250909T183000
DTEND;TZID=America/New_York:20250909T200000
RRULE:FREQ=WEEKLY;UNTIL=20260524T035900Z
EXDATE;TZID=America/New_York:20251125T183000
SUMMARY:Hub
UID:hub-recurring-event
END:VEVENT
                `);
                // Query range that includes Nov 18-25
                const startRange = DateTime.fromISO('2025-11-18T00:00:00', { zone: timezone }).toJSDate();
                const endRange = DateTime.fromISO('2025-11-26T00:00:00', { zone: timezone }).toJSDate();

                const events = parseIcsData(icsData, timezone, startRange, endRange, url);
                const eventDates = events.map(e => DateTime.fromJSDate(e.start).toISODate());

                // BUG: Nov 25 should NOT be in the results because it's marked as EXDATE
                // but it's currently appearing on the calendar
                expect(eventDates).toContain('2025-11-18'); // This is correct
                expect(eventDates).not.toContain('2025-11-25'); // BUG: This is incorrectly included
            });
        });

        it('should exclude all-day recurring events with EXDATE (BUG: Venmo Floyd)', () => {
            // BUG: Real example from calendar: "Venmo Floyd $150" event
            // has EXDATE for Dec 1, 2025, but it's still showing up on the calendar
            //
            // ICS data:
            //   DTSTART: May 1, 2025 (all-day)
            //   RRULE: FREQ=MONTHLY;COUNT=24;BYMONTHDAY=1 (occurs on 1st of each month)
            //   EXDATE: Dec 1, 2025 (this date should be excluded)
            //
            // Expected: Events for May 1, Jun 1, Jul 1... Nov 1, but NOT Dec 1
            // Actual: Dec 1 is incorrectly included (EXDATE not being respected for all-day events)
            const icsData = createIcs(`
BEGIN:VEVENT
DTSTART;VALUE=DATE:20250501
DTEND;VALUE=DATE:20250502
RRULE:FREQ=MONTHLY;COUNT=24;BYMONTHDAY=1
EXDATE;VALUE=DATE:20251201
DTSTAMP:20251206T030530Z
UID:ab70bf81eb794a71b9617845cb135d7e
CREATED:20250503T195812Z
LAST-MODIFIED:20251129T180741Z
SEQUENCE:0
STATUS:CONFIRMED
SUMMARY:Venmo Floyd $150
TRANSP:TRANSPARENT
END:VEVENT
            `);
            // Query range that specifically includes November and December
            const startRange = DateTime.fromISO('2025-11-01T00:00:00', { zone: timezone }).toJSDate();
            const endRange = DateTime.fromISO('2026-01-15T00:00:00', { zone: timezone }).toJSDate();

            const events = parseIcsData(icsData, timezone, startRange, endRange, url);
            const eventDates = events.map(e => DateTime.fromJSDate(e.start).toISODate());

            // The RRULE says BYMONTHDAY=1, so events should be on the 1st of each month
            // Expected: Nov 1, (Dec 1 EXCLUDED via EXDATE), Jan 1
            //
            // ACTUAL BUGS FOUND:
            // 1. TIMEZONE BUG: Events are appearing on the LAST day of the PREVIOUS month
            //    (Nov 30, Dec 31) instead of the 1st of the month.
            //    This is a timezone issue with all-day recurring events.
            // 2. DUPLICATE BUG: User reported seeing the event on BOTH Nov 30th AND Dec 1st
            // 3. EXDATE BUG: Dec 1 should be excluded, but we can't verify this yet
            //    because of the timezone issue

            // What SHOULD happen:
            expect(eventDates).toContain('2025-11-01');
            expect(eventDates).not.toContain('2025-12-01'); // Should be excluded by EXDATE
            expect(eventDates).toContain('2026-01-01');
        });
    });
});
