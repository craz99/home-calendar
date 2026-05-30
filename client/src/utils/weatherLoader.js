// src/utils/weatherLoader.js
const API_BASE_URL = process.env.NODE_ENV !== 'production' ? process.env.REACT_APP_API_BASE_URL : '';

/**
 * Loads weather forecast from the server's weather API.
 * It does NOT handle loading/error states; those are managed by the calling component.
 * @param {function} setWeatherForecast - React state setter for weather forecast.
 * @returns {Promise<Array>} A promise that resolves with the weather forecast array.
 * @throws {Error} If fetching or parsing weather fails.
 */
export const loadWeather = async (setWeatherForecast) => { // Removed setLoading, setError
    try {
        const response = await fetch(`${API_BASE_URL}/api/weather`);

        if (!response.ok) {
            let errorDetails = `HTTP ${response.status}`;
            if (response.statusText) {
                errorDetails += ` - ${response.statusText}`;
            }
            try {
                const errorData = await response.json();
                if (errorData && errorData.message) {
                    errorDetails = errorData.message;
                }
            } catch (parseError) {
                console.warn('Could not parse weather error response JSON:', parseError);
            }
            throw new Error(`Failed to load weather: ${errorDetails}`); // Throw the error
        }

        const data = await response.json();
        setWeatherForecast(data); // Still update state passed from App.js
        console.log("Weather forecast loaded successfully.");
        return data; // Return data for Promise.all to await

    } catch (err) {
        console.error('Error in loadWeather utility:', err);
        throw err; // Re-throw so App.js's catch block can handle it
    }
    // Removed finally block as App.js now handles setLoading(false)
};