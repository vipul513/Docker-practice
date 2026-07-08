# Full Stack Docker Practice Project

A small full-stack app for practicing **Dockerfiles**, **volumes**, and **networks**.

| Layer      | Tech                          | Port (host) |
|------------|-------------------------------|-------------|
| Frontend   | React + Vite + Nginx          | 5173        |
| Backend    | Node.js + Express             | 3000        |
| Database   | PostgreSQL 16                 | 5432        |

The app is a simple task list. The frontend talks to the backend API, and the backend reads/writes to PostgreSQL.

---

## Project structure

```
.
├── docker-compose.yml      # Orchestrates all services, networks, volumes
├── .env.example            # Environment variables template
├── init-db/
│   └── init.sql            # Seed SQL (runs on first DB start)
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── package.json
│   └── src/
│       └── index.js        # Express API
└── frontend/
    ├── Dockerfile          # Multi-stage build (Node → Nginx)
    ├── .dockerignore
    ├── nginx.conf
    ├── package.json
    └── src/                # React app
```

---

## Prerequisites

Install these before you start:

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git (optional)

Verify installation:

```bash
docker --version
docker compose version
```

---

## Quick start

### 1. Clone or open the project

```bash
cd Pipeline
```

### 2. Create your environment file

```bash
cp .env.example .env
```

Edit `.env` if you want different ports or credentials. Defaults work for local practice.

### 3. Build and start all services

```bash
docker compose up --build
```

First run will:

1. Pull the PostgreSQL image
2. Build backend and frontend images from their Dockerfiles
3. Create a Docker network (`fullstack-app-network`)
4. Create a named volume for PostgreSQL data (`fullstack-postgres-data`)
5. Run `init-db/init.sql` to create and seed the `tasks` table

### 4. Open the app

| URL | What it is |
|-----|------------|
| http://localhost:5173 | Frontend (React UI) |
| http://localhost:3000/health | Backend health check |
| http://localhost:3000/api/tasks | Tasks API (JSON) |

### 5. Stop the stack

```bash
# Stop containers (keeps volumes and network)
docker compose down

# Stop and remove volumes (deletes DB data)
docker compose down -v
```

---

## Docker concepts in this project

### 1. Dockerfiles

Each app has its own Dockerfile. A Dockerfile is a recipe for building an image.

#### Backend (`backend/Dockerfile`)

```dockerfile
FROM node:20-alpine      # Base image
WORKDIR /app             # Working directory inside container
COPY package*.json ./    # Copy dependency manifests first (layer caching)
RUN npm ci --omit=dev    # Install production deps
COPY src ./src           # Copy application code
EXPOSE 3000              # Document the port
USER node                # Run as non-root user
CMD ["npm", "start"]     # Default command
```

**Practice ideas:**
- Change the base image tag (e.g. `node:20-alpine` → `node:22-alpine`) and rebuild
- Add a `dev` stage that uses `npm run dev` with `--watch`
- Inspect image layers: `docker history fullstack-backend`

#### Frontend (`frontend/Dockerfile`) — multi-stage build

Stage 1 builds the React app. Stage 2 serves static files with Nginx. The final image does not include Node.js or source code — only the built assets.

```dockerfile
FROM node:20-alpine AS builder   # Build stage
# ... npm ci && npm run build

FROM nginx:1.27-alpine           # Production stage
COPY --from=builder /app/dist /usr/share/nginx/html
```

**Practice ideas:**
- Compare image sizes: `docker images | grep fullstack`
- Change `VITE_API_URL` build arg and rebuild the frontend
- Add a `.dockerignore` entry and see how it affects build context size

Build a single service:

```bash
docker compose build backend
docker compose build frontend
```

---

### 2. Volumes

Volumes persist data outside container lifecycle. If a container is removed, volume data remains.

#### Named volume — PostgreSQL data

In `docker-compose.yml`:

```yaml
volumes:
  postgres_data:
    name: fullstack-postgres-data

services:
  db:
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

**What this does:** All database files live in `fullstack-postgres-data`. Restarting or recreating the `db` container does not wipe your data.

**Practice commands:**

```bash
# List volumes
docker volume ls

# Inspect the volume
docker volume inspect fullstack-postgres-data

# See where Docker stores it (on macOS, inside the Docker VM)
docker volume inspect fullstack-postgres-data --format '{{ .Mountpoint }}'

# Add a task in the UI, then restart DB and confirm data persists
docker compose restart db
```

#### Bind mount — init SQL and dev hot-reload

```yaml
# Runs once on first DB initialization
- ./init-db:/docker-entrypoint-initdb.d:ro

# Mount backend source for live edits (read-only)
- ./backend/src:/app/src:ro
```

| Mount type | Path | Purpose |
|------------|------|---------|
| Bind mount | `./init-db` → `/docker-entrypoint-initdb.d` | Seed schema on first DB start (`:ro` = read-only) |
| Bind mount | `./backend/src` → `/app/src` | Edit backend code on host; restart container to pick up changes |
| Named volume | `postgres_data` → `/var/lib/postgresql/data` | Persist database files |

**Practice ideas:**
- Add a row to `init-db/init.sql`, run `docker compose down -v`, then `docker compose up` — seed runs again
- Edit `backend/src/index.js`, run `docker compose restart backend`, hit `/api/tasks`
- Remove `-v` from `down` and confirm tasks survive a full restart

---

### 3. Networks

Containers on the same user-defined network can reach each other by **service name** as hostname.

In `docker-compose.yml`:

```yaml
networks:
  app-network:
    driver: bridge
    name: fullstack-app-network

services:
  backend:
    networks:
      - app-network
  db:
    networks:
      - app-network
```

The backend connects using the hostname `db` (not `localhost`):

```
DATABASE_URL=postgres://appuser:apppassword@db:5432/appdb
```

Inside the backend container, `localhost` would point to the backend itself — not PostgreSQL. The service name `db` resolves via Docker's internal DNS.

**Practice commands:**

```bash
# List networks
docker network ls

# Inspect the network (see connected containers)
docker network inspect fullstack-app-network

# Ping DB from backend container
docker compose exec backend sh -c "wget -qO- http://db:5432 || echo 'DB port reachable'"

# Open a shell inside backend and test DNS
docker compose exec backend sh
# then: ping db
```

**Practice ideas:**
- Temporarily remove `backend` from `app-network` and watch the health check fail
- Add a fourth service (e.g. Adminer) on the same network to browse the DB
- Use `docker compose exec db psql -U appuser -d appdb -c "SELECT * FROM tasks;"` to query directly

---

## docker-compose.yml walkthrough

```yaml
services:
  db:        # PostgreSQL — data volume + init scripts
  backend:   # Express API — depends on healthy db
  frontend:  # React static site — depends on backend

networks:
  app-network:   # Private bridge network for inter-service communication

volumes:
  postgres_data: # Named volume for persistent DB storage
```

Key settings:

| Setting | Service | Purpose |
|---------|---------|---------|
| `healthcheck` | db | Backend waits until Postgres is ready |
| `depends_on.condition: service_healthy` | backend | Avoids connection errors on startup |
| `build.args.VITE_API_URL` | frontend | Bakes API URL into React build |
| `ports` | all | Maps container ports to your machine |

---

## Common commands cheat sheet

```bash
# Start in background
docker compose up -d --build

# View logs (all services)
docker compose logs -f

# View logs for one service
docker compose logs -f backend

# List running containers
docker compose ps

# Rebuild one service after Dockerfile changes
docker compose up -d --build backend

# Run a one-off command in a service
docker compose exec db psql -U appuser -d appdb

# Remove everything including volumes (fresh start)
docker compose down -v --rmi local
```

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Backend + DB status |
| GET | `/api/tasks` | List all tasks |
| POST | `/api/tasks` | Create task `{ "title": "..." }` |
| PATCH | `/api/tasks/:id` | Toggle task `{ "completed": true }` |

Example:

```bash
curl http://localhost:3000/api/tasks

curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"Build a multi-stage Dockerfile"}'
```

---

## Local development (without Docker)

You can run services natively for faster iteration. You still need PostgreSQL running (via Docker or locally).

```bash
# Start only the database
docker compose up db -d

# Backend
cd backend && npm install && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

Set `VITE_API_URL=http://localhost:3000` in `frontend/.env.local` for local frontend dev.

---

## Troubleshooting

### Port already in use

Change ports in `.env`:

```env
BACKEND_PORT=3001
FRONTEND_PORT=8080
POSTGRES_PORT=5433
```

Then run `docker compose up --build` again.

### Backend shows "database disconnected"

- Wait for the db healthcheck to pass: `docker compose ps`
- Check logs: `docker compose logs db backend`
- Ensure `DATABASE_URL` uses host `db`, not `localhost`

### Frontend cannot reach backend

- The browser runs on your host, so `VITE_API_URL` must be `http://localhost:3000` (not `http://backend:3000`)
- Rebuild frontend after changing `VITE_API_URL`: `docker compose up --build frontend`

### Database is empty after restart

- If you ran `docker compose down -v`, volumes were deleted — that is expected
- Use `docker compose down` (without `-v`) to keep data

### Reset everything

```bash
docker compose down -v --rmi local
docker compose up --build
```

---

## Suggested learning exercises

1. **Dockerfile layers** — Add a useless `RUN echo` line in the backend Dockerfile and compare build times with and without cache.
2. **Volume persistence** — Add tasks, restart containers, delete containers, compare behavior with/without `-v`.
3. **Network isolation** — Connect to `db:5432` from backend (works) vs from your host (use `localhost:5432`).
4. **Multi-stage build** — Add a `development` target to the frontend Dockerfile that runs Vite dev server instead of Nginx.
5. **Health checks** — Break the DB password in `.env` and observe how `depends_on` + healthcheck behave.
6. **Add Adminer** — Add a database UI container on `app-network` (port 8080) for visual DB exploration.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_USER` | appuser | PostgreSQL username |
| `POSTGRES_PASSWORD` | apppassword | PostgreSQL password |
| `POSTGRES_DB` | appdb | Database name |
| `POSTGRES_PORT` | 5432 | Host port for PostgreSQL |
| `BACKEND_PORT` | 3000 | Host port for API |
| `FRONTEND_PORT` | 5173 | Host port for UI |
| `VITE_API_URL` | http://localhost:3000 | API URL baked into frontend build |
| `NODE_ENV` | development | Node environment |

---

## License
