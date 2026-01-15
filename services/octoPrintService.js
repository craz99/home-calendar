import axios from 'axios';

const CACHE_DURATION_MS = 30000; // 30 seconds cache for printer status

let cachedStatus = null;
let lastFetchTime = 0;

/**
 * Fetches the current status from OctoPrint server
 * @returns {Promise<{printing: boolean, progress: number, fileName: string|null}>}
 */
export async function getOctoPrintStatus() {
    const now = Date.now();

    // Return cached status if still fresh
    if (cachedStatus && (now - lastFetchTime) < CACHE_DURATION_MS) {
        return cachedStatus;
    }

    const octoPrintUrl = process.env.OCTOPRINT_URL;
    const octoPrintApiKey = process.env.OCTOPRINT_API_KEY;

    // If not configured, return default status
    if (!octoPrintUrl || !octoPrintApiKey) {
        console.warn('OctoPrint not configured. Set OCTOPRINT_URL and OCTOPRINT_API_KEY in .env');
        return {
            printing: false,
            progress: 0,
            fileName: null,
            enabled: false
        };
    }

    try {
        // Fetch printer job status
        const response = await axios.get(`${octoPrintUrl}/api/job`, {
            headers: {
                'X-Api-Key': octoPrintApiKey
            },
            timeout: 5000 // 5 second timeout
        });

        const jobData = response.data;
        const state = jobData.state?.toLowerCase() || '';
        const isPrinting = state === 'printing' || state === 'paused';

        const status = {
            printing: isPrinting,
            progress: Math.round(jobData.progress?.completion || 0),
            fileName: jobData.job?.file?.name || null,
            state: state,
            enabled: true
        };

        // Cache the result
        cachedStatus = status;
        lastFetchTime = now;

        return status;
    } catch (error) {
        console.error('Error fetching OctoPrint status:', error.message);

        // Return cached data if available, otherwise return default
        if (cachedStatus) {
            return cachedStatus;
        }

        return {
            printing: false,
            progress: 0,
            fileName: null,
            error: true,
            enabled: true
        };
    }
}
