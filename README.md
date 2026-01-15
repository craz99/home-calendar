# Home Calendar

Full-stack calendar app aggregating multiple calendar sources (Google Calendar, etc.) with IoT monitoring and weather forecasting.

## Features

- **Calendar Aggregation** - Combine Google Calendar, local ICS files, and other calendar sources
- **Recurring Events** - Full support for recurring events with timezone handling
- **Weather Integration** - Display current weather from OpenWeatherMap with caching
- **IoT Monitoring** - Optional real-time garage door status (MQTT) and 3D printer monitoring (OctoPrint)
- **Mobile Responsive** - React-based UI with Bootstrap for responsive design
- **Docker Ready** - Easy deployment with Docker Compose to any platform (amd64/arm64)

## Prerequisites

- **Docker** - For container-based deployment (recommended)
- **Node.js 25+** - For local development
- **OpenWeatherMap API Key** - Free tier available at openweathermap.org

## Project Structure

### Overview
- **Backend:** Node.js + Express API with calendar aggregation, weather, and IoT integrations
- **Frontend:** React 19 calendar UI with real-time updates
- **Tech Stack:** Node.js, React, Bootstrap, luxon, moment, mqtt, axios
- **Deployment:** Docker (recommended) or PM2

### Directory Layout

```
home-calendar/
├── client/                        # React frontend
│   ├── src/                       # React components
│   │   ├── App.js                # Main calendar component
│   │   └── utils/                # Event/weather loaders, config
│   └── public/                   # Static assets
├── services/                      # Backend services
│   ├── calendarService.js        # Parse ICS calendars, recurring events
│   ├── weatherService.js         # OpenWeatherMap API
│   ├── octoPrintService.js       # 3D printer status (optional)
│   └── garageDoorService.js      # MQTT garage door (optional)
├── server.js                      # Express backend
├── Dockerfile                     # Docker image definition
├── docker-compose.yml            # Docker Compose config
├── docker-build.sh               # Build script
├── docker-deploy.sh              # Deploy script
├── docker-entrypoint.sh          # Container startup
├── public-config.template.json   # Calendar config template
├── .env.docker                   # Environment variables template
└── .gitignore                    # Git exclusions
```

### Key Services

| File | Purpose |
|------|---------|
| `calendarService.js` | Fetch and parse ICS calendars, handle recurring events with timezone support |
| `weatherService.js` | OpenWeatherMap API integration with 6-hour caching |
| `octoPrintService.js` | Poll 3D printer status via OctoPrint API (optional) |
| `garageDoorService.js` | Real-time MQTT garage door state monitoring (optional) |

## Docker Deployment

### Build Image

Build for your current host platform:

```bash
./docker-build.sh home-calendar latest
```

### Deploy to Host

Deploy to a remote host (requires platform argument):

```bash
./docker-deploy.sh 192.168.1.100 ubuntu arm64
./docker-deploy.sh 192.168.1.100 ubuntu amd64
```

**What the script does:**
1. Builds for specified platform (amd64 or arm64)
2. Saves as archive
3. Transfers to host and loads image
4. Creates config files from templates (first deploy only)
5. On re-deployment: preserves all user customizations, saves new docker-compose.yml as docker-compose.new.yml for reference

### Configuration

SSH to host and edit:

```bash
ssh ubuntu@192.168.1.100
cd /opt/docker/home-calendar
nano .env
```

**Required in .env:**
- `OPENWEATHER_API_KEY` - Get from openweathermap.org
- `WEATHER_DEFAULT_LATITUDE` and `WEATHER_DEFAULT_LONGITUDE` - Your location

**Optional in public-config.json:**
- Add calendar URLs (Google Calendar, etc.)
- Change `showGarageDoorStatus`, `showPrinterStatus` if needed
- Change `appTitle` for custom app name

**To use custom public-config.json:**
Uncomment the volume mount in `docker-compose.yml`:
```yaml
volumes:
  - ./public-config.json:/app/public-config.json:ro
  - home-calendar-cache:/app/cache
```

### Start Container

```bash
docker compose up -d
docker compose logs -f
```

### Common Commands

```bash
docker compose ps              # Check status
docker compose logs -f         # View logs
docker compose restart         # Restart
docker compose down            # Stop
```

### Access

Navigate to `http://localhost:5500` or `http://your-host-ip:5500`

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Port in use | Change `PORT=5501` in `.env` |
| Missing weather | Add `OPENWEATHER_API_KEY` to `.env` |
| Calendars not loading | Check ICS URLs in `public-config.json` |
| View errors | `docker compose logs home-calendar` |

## Development

### Local Setup

```bash
npm install
cd client && npm install && cd ..
npm run dev
```

Runs backend on port 5500 and frontend dev server on port 3000 with hot-reload.

### Build for Production

```bash
npm run build
```

Compiles React to `client/build/` for static serving.

### Testing & Linting

```bash
npm test              # Run Jest tests
npm run lint          # Run ESLint
npm run test_verbose # Verbose test output
```

## License

This project is licensed under the Apache License 2.0 - see the `LICENSE` file for details.

Apache 2.0 allows you to use, modify, and distribute this project freely for commercial or personal use, with minimal restrictions.
