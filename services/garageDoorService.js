import mqtt from 'mqtt';

let mqttClient = null;
let cachedState = null;
let lastUpdateTime = 0;
let connectionStatus = 'disconnected';

/**
 * Initialize the MQTT connection and subscribe to garage door state
 */
export function initializeGarageDoorService() {
    const mqttBroker = process.env.MQTT_BROKER;
    const mqttUsername = process.env.MQTT_USERNAME;
    const mqttPassword = process.env.MQTT_PASSWORD;
    const mqttTopic = process.env.MQTT_GARAGE_DOOR_TOPIC || 'home/garage/door/state';

    // If MQTT is not configured, don't initialize
    if (!mqttBroker || !mqttUsername || !mqttPassword) {
        console.warn('MQTT not configured - set MQTT_BROKER, MQTT_USERNAME, and MQTT_PASSWORD environment variables');
        return;
    }

    // If already connected, don't reconnect
    if (mqttClient && mqttClient.connected) {
        console.log('MQTT client already connected');
        return;
    }

    console.log(`Connecting to MQTT broker at ${mqttBroker}...`);

    // Connect to MQTT broker
    mqttClient = mqtt.connect(`mqtt://${mqttBroker}`, {
        username: mqttUsername,
        password: mqttPassword,
        reconnectPeriod: 5000, // Reconnect every 5 seconds if disconnected
        connectTimeout: 10000   // 10 second connection timeout
    });

    mqttClient.on('connect', () => {
        console.log('Connected to MQTT broker');
        connectionStatus = 'connected';

        // Subscribe to the garage door state topic
        mqttClient.subscribe(mqttTopic, (err) => {
            if (err) {
                console.error('Failed to subscribe to MQTT topic:', err);
                connectionStatus = 'error';
            } else {
                console.log(`Subscribed to MQTT topic: ${mqttTopic}`);
            }
        });
    });

    mqttClient.on('message', (topic, message) => {
        // Update cached state when a message is received
        const state = message.toString();
        cachedState = state;
        lastUpdateTime = Date.now();
        console.log(`Garage door state updated: ${state}`);
    });

    mqttClient.on('error', (err) => {
        console.error('MQTT client error:', err);
        connectionStatus = 'error';
    });

    mqttClient.on('offline', () => {
        console.warn('MQTT client offline');
        connectionStatus = 'offline';
    });

    mqttClient.on('reconnect', () => {
        console.log('MQTT client reconnecting...');
        connectionStatus = 'reconnecting';
    });
}

/**
 * Get the current garage door state
 * @returns {Promise<{state: string|null, lastUpdate: number|null, connected: boolean}>}
 */
export async function getGarageDoorState() {
    // If MQTT is not configured or disabled, return default state
    if (!process.env.MQTT_BROKER && process.env.MQTT_ENABLED === 'false') {
        return {
            state: null,
            lastUpdate: null,
            connected: false,
            enabled: false
        };
    }

    // Initialize if not already done
    if (!mqttClient) {
        initializeGarageDoorService();
    }

    return {
        state: cachedState,
        lastUpdate: lastUpdateTime || null,
        connected: mqttClient?.connected || false,
        connectionStatus: connectionStatus,
        enabled: true
    };
}

/**
 * Cleanup function to disconnect MQTT client
 */
export function disconnectGarageDoor() {
    if (mqttClient) {
        mqttClient.end();
        mqttClient = null;
        connectionStatus = 'disconnected';
        console.log('MQTT client disconnected');
    }
}
