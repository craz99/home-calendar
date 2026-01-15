// calendarConfig.js
// New constants for event icons and refresh intervals
export const WORD_TO_ICON_MAP = new Map([
    ['dentist', 'fa-tooth'],
    ['church', 'fa-cross'],
    ['dinner', 'fa-utensils'],
    ['lunch', 'fa-utensils'],
    ['breakfast', 'fa-utensils'],
    ['brunch', 'fa-utensils'],
    ['school', 'fa-school'],
    ['concert', 'fa-music'],
    ['pay', 'fa-dollar-sign'],
    ['venmo', 'fa-dollar-sign'],
    ['meeting', 'fa-handshake'],
    ['soccer', 'fa-futbol'],
    ['mtb', 'fa-bicycle'],
    ['trail work', 'fa-bicycle'],
    ['presentation', 'fa-chalkboard-user'],
    ['deadline', 'fa-hourglass-half'],
    ['holiday', 'fa-sun'],
    ['call', 'fa-phone'],
    ['zoom', 'fa-phone'],
    ['travel', 'fa-plane'],
    ['birthday', 'fa-birthday-cake'],
    ['anniversary', 'fa-cake-candles'],
]);

export const REFRESH_INTERVAL_MINUTES = 20; // For event fetching
export const TIME_UPDATE_INTERVAL_SECONDS = 60; // For current time display