// ecosystem.config.template.cjs
// Template for PM2 process manager configuration
// Copy this to ecosystem.config.cjs and customize with your values
// DO NOT COMMIT ecosystem.config.cjs - it's in .gitignore

export default {
    apps : [{
        name   : "calendar-app", // A friendly name for your application
        script : "./server.js",  // Path to your main server file

        // Optional: Enable watching for changes and restarting (only for development)
        // watch  : true,
        // ignore_watch : ["node_modules", "client/build", ".env"],

        // Default environment variables (can be overridden by --env)
        env: {
            NODE_ENV: "development",
            PORT: 5500,
            CACHE_DURATION_MS: 60000, // 1 minute for faster testing
            IGNORED_EVENT_IDS: "", // Comma-separated event IDs to ignore
        },

        // Production-specific environment variables
        env_production : {
            NODE_ENV: "production",
            PORT: 5500, // Or whatever port you use in production (e.g., 80 if behind a proxy)
            CACHE_DURATION_MS: 600000, // 10 minutes (10 * 60 * 1000)
            IGNORED_EVENT_IDS: "", // Comma-separated event IDs to ignore
        },

        // You can add more environments, e.g., env_staging, env_test
    }]
};
