# Smart City Traffic Management Platform

A full-featured SaaS platform for tracking and managing traffic violations, built with JWT auth, Flask/PostgreSQL backend, and a static HTML/Bootstrap-free frontend (pure CSS design system).

## Architecture

- **Frontend**: Static HTML/CSS/JS (custom design system, no Bootstrap) served from `frontend/` on port 5000
- **Backend**: Flask REST API in `backend/` running on port 8000
- **Database**: Replit PostgreSQL (via `DATABASE_URL` env var)
- **Proxy**: `server.py` serves frontend on port 5000 and proxies `/api/*` to backend on port 8000

## Project Structure

```
.
├── backend/
│   ├── app/
│   │   ├── __init__.py       # Flask app factory (CORS, blueprints, seeds cameras)
│   │   ├── config.py         # Config (PostgreSQL, JWT, etc.)
│   │   ├── middleware.py     # JWT token_required decorator
│   │   ├── models.py         # SQLAlchemy models: User, Violation, Vehicle, Camera
│   │   └── routes/
│   │       ├── auth.py       # /api/auth/register, /api/auth/login
│   │       ├── traffic.py    # /api/traffic/violations (GET,POST,PUT,DELETE,pay)
│   │       ├── vehicles.py   # /api/vehicles (GET,POST,PUT,DELETE)
│   │       ├── cameras.py    # /api/cameras (GET,POST,PUT,DELETE)
│   │       ├── users.py      # /api/users, /api/users/:id/role
│   │       └── reports.py    # /api/reports/stats|violations-by-type|violations-by-month|top-vehicles
│   ├── requirements.txt
│   └── run.py                # Entrypoint (port 8000)
├── frontend/
│   ├── index.html            # Landing page
│   ├── login.html            # Login / Register page
│   ├── dashboard.html        # Main overview with charts + stats
│   ├── violations.html       # Violations table with search, filter, sort, pay
│   ├── vehicles.html         # Vehicle management (register, edit, delete)
│   ├── reports.html          # Analytics — monthly bar chart, type doughnut, top vehicles
│   ├── cameras.html          # Camera card grid with status monitoring
│   ├── users.html            # User management (admin only) + role change
│   ├── profile.html          # User profile + account settings
│   ├── css/style.css         # Custom design system (light/dark, components)
│   └── js/
│       ├── app.js            # Auth helpers, Toast, Theme, apiFetch, initSidebar
│       ├── auth.js           # Legacy shim (logic is inline in login.html)
│       ├── main.js           # Landing page nav auth state
│       ├── dashboard.js      # Dashboard stats, doughnut + bar charts, activity feed
│       ├── violations.js     # Violations table, sort, filter, pay modal, add modal
│       ├── vehicles.js       # Vehicle CRUD, table with pagination
│       ├── reports.js        # Reports charts (Chart.js), top vehicles table
│       ├── cameras.js        # Camera card grid, add/edit/delete (admin)
│       └── users.js          # Users table, role change modal (admin only)
├── database/
│   └── schema.sql            # Reference SQL schema
├── server.py                 # Python proxy + static server (port 5000)
└── .env                      # Environment variables template
```

## Workflows

- **Start application** (`python server.py`) — Frontend on port 5000 (webview)
- **Backend API** (`cd backend && python run.py`) — Flask API on port 8000 (console)

## Demo Credentials

Register an account via the login page. To get admin access:
- Register at `/login.html`
- The first admin account is: `admin@demo.com` / `demo1234`

## Key Features

### Modules
- **Dashboard** — Stats cards (violations, pending, paid, revenue, vehicles, cameras), doughnut chart, monthly bar chart (admin/officer), activity feed, recent violations table
- **Violations** — Full CRUD table with search, status filter, type filter, column sort, pagination, detail modal, payment modal (real API call), delete (admin)
- **Vehicles** — Register/edit/delete vehicles, search by plate/owner, type/status filter, violation count per vehicle
- **Reports** — Monthly violations bar + revenue line chart, violation type doughnut chart, top 10 violating vehicles table (officer/admin only)
- **Cameras** — Card grid showing 6 seeded demo cameras, status indicator (Online/Offline/Maintenance), AI detection flag, violations detected counter (admin CRUD)
- **Users** — Users table with role badges, change role modal (admin only)
- **Profile** — Account info, stats, dark mode toggle, sign out

### Auth & Roles
- JWT-based authentication
- Roles: `admin`, `officer`, `citizen`
- Admin-only sidebar items (Users) shown via JS after login
- Admin/officer-only: Reports page, Add Violation, Add Vehicle, Camera management
- Citizens see only their own violations

### UI/UX
- Full dark mode with localStorage persistence
- Animated toasts (success/error/warning/info)
- Skeleton loading states on all tables
- Offline banner when server is unreachable
- Responsive sidebar with mobile hamburger menu
- Pagination on all data tables

## Database

- Replit-managed PostgreSQL
- Tables auto-created via SQLAlchemy `db.create_all()` on startup
- 6 demo cameras seeded automatically on first run
- Models: `users`, `violations` (+ location, paid_at columns), `vehicles`, `cameras`

## API Reference

| Method | Endpoint | Access |
|--------|----------|--------|
| POST | /api/auth/register | Public |
| POST | /api/auth/login | Public |
| GET | /api/traffic/violations | All |
| POST | /api/traffic/violations | Officer/Admin |
| PUT | /api/traffic/violations/:id | Officer/Admin |
| DELETE | /api/traffic/violations/:id | Admin |
| POST | /api/traffic/violations/:id/pay | All |
| GET | /api/vehicles | All |
| POST | /api/vehicles | Officer/Admin |
| PUT | /api/vehicles/:id | Officer/Admin |
| DELETE | /api/vehicles/:id | Admin |
| GET | /api/cameras | All |
| POST | /api/cameras | Admin |
| PUT | /api/cameras/:id | Admin |
| DELETE | /api/cameras/:id | Admin |
| GET | /api/users | Admin |
| PUT | /api/users/:id/role | Admin |
| GET | /api/reports/stats | Officer/Admin |
| GET | /api/reports/violations-by-month | Officer/Admin |
| GET | /api/reports/violations-by-type | Officer/Admin |
| GET | /api/reports/top-vehicles | Officer/Admin |

## Dependencies

Flask, Flask-SQLAlchemy, Flask-Migrate, Flask-CORS, PyJWT, psycopg2-binary, gunicorn, Chart.js 4.4.0 (CDN)
