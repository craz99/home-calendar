# Home Calendar Deployment Guide

This guide covers deploying home-calendar to `/opt/docker/home-calendar` on a remote server.

## Prerequisites

- Docker and Docker Compose installed on target server
- The deployment package files
- Docker image files in `DOCKER_IMAGES/` directory

## Step 1: Prepare Deployment Files

Extract or copy the deployment package contents to `/opt/docker/home-calendar`:

```bash
cd /opt/docker/home-calendar
# Copy the following files from the deployment package:
# - docker-compose.yml
# - .env.docker
# - public-config.template.json
# - DOCKER_IMAGES/ (directory with Docker image files)
```

Verify all files are in place:

```bash
ls -la /opt/docker/home-calendar
```

## Step 2: Load Docker Images

Load the saved Docker images into your local Docker daemon:

```bash
cd /opt/docker/home-calendar
./DOCKER_IMAGES/load-images.sh
```

Or manually load images:

```bash
docker load -i DOCKER_IMAGES/home-calendar-latest.tar.gz
```

Verify the image is loaded:

```bash
docker images | grep home-calendar
```

## Step 2: Configure Environment Variables

Copy and customize the environment template:

```bash
cd /opt/docker/home-calendar
cp .env.docker .env
nano .env  # or your preferred editor
```

### Required Configuration

The following variables **must** be set:

- **OPENWEATHER_API_KEY**: Get a free API key from [OpenWeatherMap](https://openweathermap.org/api)
- **WEATHER_DEFAULT_LATITUDE**: Default weather location latitude
- **WEATHER_DEFAULT_LONGITUDE**: Default weather location longitude

### Optional Configuration

- **OCTOPRINT_URL** / **OCTOPRINT_API_KEY**: For 3D printer monitoring
- **MQTT_BROKER** / **MQTT_USERNAME** / **MQTT_PASSWORD**: For IoT device integration
- **IGNORED_EVENT_IDS**: Calendar event IDs to ignore (comma-separated)
- **API_BASE_URL**: For multi-domain setups
- **PORT**: Change from default 5500 if needed
- **CACHE_DURATION_MS**: Data cache duration (default 600000ms = 10 minutes)

### Example .env

```bash
NODE_ENV=production
PORT=5500
CACHE_DURATION_MS=600000

# Weather (REQUIRED)
OPENWEATHER_API_KEY=your_api_key_here
WEATHER_DEFAULT_LATITUDE=40.7128
WEATHER_DEFAULT_LONGITUDE=-74.0060

# Optional integrations
OCTOPRINT_URL=
OCTOPRINT_API_KEY=
MQTT_BROKER=
MQTT_USERNAME=
MQTT_PASSWORD=
MQTT_GARAGE_DOOR_TOPIC=
```

## Step 3: Configure Calendar (Optional)

If you want to customize which calendars are displayed:

```bash
cd /opt/docker/home-calendar
cp public-config.template.json public-config.json
nano public-config.json
```

Then uncomment the volume line in `docker-compose.yml`:

```yaml
volumes:
  - ./public-config.json:/app/public-config.json:ro
  - home-calendar-cache:/app/cache
```

## Step 4: Start the Container

```bash
cd /opt/docker/home-calendar
docker-compose up -d
```

Verify the container is running:

```bash
docker-compose ps
docker-compose logs home-calendar
```

Check the health status:

```bash
docker-compose ps  # Look for "healthy" in STATUS column
```

## Step 5: Access the Application

The application will be available at:

```
http://localhost:5500
```

Or your server's IP:

```
http://server-ip:5500
```

If you changed the `PORT` variable, use that port instead of 5500.

## Common Operations

### View Logs

```bash
cd /opt/docker/home-calendar
docker-compose logs -f home-calendar
```

### Restart Container

```bash
cd /opt/docker/home-calendar
docker-compose restart
```

### Stop Container

```bash
cd /opt/docker/home-calendar
docker-compose down
```

### Update to New Version

1. Save the new image:
   ```bash
   docker save home-calendar:latest | gzip > /path/to/DOCKER_IMAGES/home-calendar-latest.tar.gz
   ```

2. SCP the updated image to the server

3. Load the new image:
   ```bash
   ./DOCKER_IMAGES/load-images.sh
   ```

4. Restart the container:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

The cache volume will persist between updates.

## Troubleshooting

### Container won't start

Check the logs:
```bash
docker-compose logs home-calendar
```

Common issues:
- Missing `OPENWEATHER_API_KEY` in `.env`
- Port 5500 already in use - change `PORT` in `.env`
- Image not loaded - run `./DOCKER_IMAGES/load-images.sh`

### Application not responding

Check if container is healthy:
```bash
docker-compose ps
```

If unhealthy, restart:
```bash
docker-compose restart
```

### Persistent issues

Check disk space and Docker logs:
```bash
docker system df
docker system logs
```

For more detailed debugging:
```bash
docker-compose exec home-calendar node -e "console.log(process.env)"
```

## Data Persistence

Calendar cache data is stored in a Docker volume: `home-calendar-cache`

To backup the cache:
```bash
docker run --rm -v home-calendar-cache:/data -v /backup:/backup alpine tar czf /backup/home-calendar-cache.tar.gz -C /data .
```

To restore:
```bash
docker run --rm -v home-calendar-cache:/data -v /backup:/backup alpine tar xzf /backup/home-calendar-cache.tar.gz -C /data
```

## Security Notes

- The container runs as a non-root user for security
- Health checks are performed automatically every 30 seconds
- Container will automatically restart unless stopped
- Resource limits are configured to prevent runaway processes
