# Artisan Café POS | Inventory & Point-of-Sale System

A refined, commercial-grade point-of-sale and café inventory management platform featuring real-time stock management, concurrency-safe transactions, automated 5-minute reservation expirations, and resilient payment workflows.

---

## 1. Project Overview

**Artisan Café POS** is a high-performance retail point-of-sale and café management system engineered for independent roasteries, artisan bakeries, and specialty coffee establishments. Designed to solve common hospitality hurdles—such as race conditions during morning peak rushes, orphaned stock holds from abandoned orders, and double-billing on network hiccups—the system couples a robust **FastAPI** backend with a responsive **React (Vite + TypeScript + Tailwind CSS)** register.

### Core Objectives
- **Zero Overselling**: Enforces row-level database locking (`SELECT FOR UPDATE`) during checkout and reservation creation so that concurrent buyers cannot claim the same physical inventory.
- **Automated Hold Expiration**: Implements a 5-minute reservation TTL with a background sweeper task that automatically replenishes stock if a checkout is abandoned or times out.
- **Strict Financial Idempotency**: Guarantees that duplicate payment submissions with identical idempotency keys never result in multiple charges or corrupted order states.
- **Audit Attribution & RBAC**: Tracks operator sessions using secure HttpOnly cookies, attributing every order and transition to an authenticated cashier or manager.

---

## 2. Key Features

- **Product Catalog Management**: Create, update, soft-delete, activate/deactivate, and browse products with real-time stock visibility and categorization.
- **High-Performance POS Register**: Responsive grid layout with quick search, category filtering, cart management, and live pricing calculations.
- **Stock Reservation Engine**: Automatically creates temporary inventory holds when checkout initiates, preventing cart race conditions.
- **Automatic Stock Release**: Background worker monitors expiring reservations and releases locked quantities back to `available_stock` without downtime.
- **Simulated Payment Gateway**:
  - Handles **Success**, **Failure** (card declined/network drop), and **Timeout** outcomes.
  - Idempotency key protection prevents duplicate billing on network retries.
- **Order Lifecycle Management**: Complete state machine tracking orders across `PENDING`, `RESERVED`, `PAID`, `CANCELLED`, and `REFUNDED` statuses.
- **Manager Workflows & Overrides**: Manager-only access to cancel unfinalized orders, trigger customer refunds with automatic stock restoration, and manage staff user accounts.
- **User & Session Management**:
  - Role-Based Access Control (`manager` vs. `cashier`).
  - Bcrypt password hashing (cost factor 12) with 12+ character enforcement.
  - Opaque SHA-256 session token hashing stored in database with automatic expiry.

---

## 3. Technology Stack

### Backend
- **Framework**: FastAPI (Python 3.10+)
- **Database**: PostgreSQL 16+
- **ORM & Driver**: SQLAlchemy 2.0 with Psycopg 3 (`psycopg` / `psycopg-binary`)
- **Schema & Validation**: Pydantic v2 & Pydantic-Settings
- **Migrations**: Alembic
- **Testing**: Pytest, Pytest-Asyncio, HTTPX

### Frontend
- **Framework**: React 19 with Vite 8
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **UI Components**: Custom accessible UI primitives & Radix/Base-UI patterns

### Infrastructure & Tooling
- **Containerization**: Docker & Docker Compose
- **Configuration**: Dotenv (`.env`) with environment-based validation

---

## 4. Architecture

The system follows clean layered architecture principles:
1. **API Layer (`app/api`)**: FastAPI APIRouters handling HTTP transport, input validation via Pydantic schemas, dependency injection for sessions, and role authorization.
2. **Service Layer (`app/services`)**: Encapsulates business logic, transactional boundaries, order state mutations, and coordination between inventory and payments.
3. **Repository Layer (`app/repositories`)**: Encapsulates database queries and persistence patterns.
4. **Data Models Layer (`app/models`)**: SQLAlchemy ORM entities mapping directly to relational tables with constraint definitions and relationship graphs.
5. **Core & Security Layer (`app/core`)**: Security primitives, session hashing, password policies, and runtime environment settings.

---

## 5. System Architecture Diagram

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React + Vite + TypeScript)"]
        UI["POS Register / Admin Dashboard"]
        AuthCtx["Auth Context (Session State)"]
        APICaller["Fetch API Client (Credentials Included)"]
    end

    subgraph Server["Backend Server (FastAPI)"]
        Router["FastAPI Routers (/auth, /products, /carts, /orders, /payments, /users)"]
        Deps["Auth & RBAC Middleware (HttpOnly Cookie)"]
        Services["Domain Services (Checkout, Payment, Order, Cart, Expiry)"]
        Worker["Async Background Sweeper (Reservation Expiry)"]
        Repo["SQLAlchemy 2.0 Engine & Repositories"]
    end

    subgraph Storage["Database (PostgreSQL)"]
        DB[(PostgreSQL 16 Engine)]
    end

    UI --> AuthCtx
    AuthCtx --> APICaller
    APICaller -- "HTTP Requests with pos_session Cookie" --> Router
    Router --> Deps
    Deps --> Services
    Services --> Repo
    Worker -- "Periodic Sweep (Every 5s)" --> Services
    Repo -- "Connection Pool (Psycopg 3)" --> DB
```

---

## 6. Database ER Diagram

```mermaid
erDiagram
    USERS ||--o{ USER_SESSIONS : "has"
    USERS ||--o{ ORDERS : "handles"
    CARTS ||--o{ CART_ITEMS : "contains"
    PRODUCTS ||--o{ CART_ITEMS : "referenced_in"
    CARTS ||--o| ORDERS : "converted_to"
    ORDERS ||--o{ ORDER_ITEMS : "includes"
    PRODUCTS ||--o{ ORDER_ITEMS : "records"
    ORDERS ||--o{ RESERVATIONS : "reserves_for"
    PRODUCTS ||--o{ RESERVATIONS : "held_stock"
    ORDERS ||--o{ PAYMENTS : "billed_under"

    USERS {
        uuid id PK
        string email UK
        string hashed_password
        string display_name
        string role "manager | cashier"
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    USER_SESSIONS {
        uuid id PK
        uuid user_id FK
        string session_token_hash UK
        timestamptz expires_at
        timestamptz created_at
    }

    PRODUCTS {
        uuid id PK
        string name
        numeric price
        integer available_stock
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    CARTS {
        uuid id PK
        timestamptz created_at
        timestamptz updated_at
    }

    CART_ITEMS {
        uuid id PK
        uuid cart_id FK
        uuid product_id FK
        integer quantity
        timestamptz created_at
        timestamptz updated_at
    }

    ORDERS {
        uuid id PK
        uuid cart_id FK
        uuid handler_id FK
        string status "PENDING | RESERVED | PAID | CANCELLED | REFUNDED"
        numeric total_amount
        timestamptz created_at
        timestamptz updated_at
    }

    ORDER_ITEMS {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        string product_name
        integer quantity
        numeric unit_price
        numeric subtotal
    }

    RESERVATIONS {
        uuid id PK
        uuid order_id FK
        uuid product_id FK
        integer quantity
        string status "ACTIVE | RELEASED | CONSUMED"
        timestamptz expires_at
        timestamptz created_at
    }

    PAYMENTS {
        uuid id PK
        uuid order_id FK
        string idempotency_key UK
        numeric amount
        string status "SUCCESS | FAILED | TIMEOUT"
        timestamptz processed_at
        timestamptz created_at
    }
```

---

## 7. Order State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING: Create Cart
    PENDING --> RESERVED: Initiate Checkout (Stock Locked & 5m Timer Started)
    
    RESERVED --> PAID: Payment Confirmed (Success)
    RESERVED --> CANCELLED: Reservation Timeout / Manual Cancel
    
    PAID --> REFUNDED: Manager Refund (Restores Stock)
    
    CANCELLED --> [*]
    REFUNDED --> [*]
    PAID --> [*]
```

### State Definitions
- **`PENDING`**: Cart created and items added. Stock has not yet been deducted or reserved.
- **`RESERVED`**: Checkout initiated. Stock quantities have been deducted from `available_stock` and allocated to an `ACTIVE` reservation record with a 5-minute expiry.
- **`PAID`**: Payment completed successfully within the 5-minute window. Reservation transitions to `CONSUMED`.
- **`CANCELLED`**: Checkout aborted, payment failed/timed out past recovery, or reservation expired. Locked stock is returned to `available_stock` and reservation marked `RELEASED`.
- **`REFUNDED`**: Post-settlement reversal performed by an authorized manager. Purchased units are safely restored to active product inventory.

---

## 8. Reservation Lifecycle

```mermaid
sequenceDiagram
    autonumber
    actor Cashier as Operator (POS UI)
    participant API as FastAPI Backend
    participant DB as PostgreSQL
    participant Worker as Expiry Sweeper Task

    Cashier->>API: POST /carts/{id}/checkout
    activate API
    API->>DB: BEGIN TRANSACTION
    API->>DB: SELECT * FROM products WHERE id IN (...) FOR UPDATE
    Note over API,DB: Row-level lock acquired; stock verified
    API->>DB: UPDATE products SET available_stock = available_stock - qty
    API->>DB: INSERT INTO reservations (status='ACTIVE', expires_at=NOW() + 5m)
    API->>DB: INSERT INTO orders (status='RESERVED')
    API->>DB: COMMIT TRANSACTION
    API-->>Cashier: 200 OK (Order RESERVED, expires_at timestamp)
    deactivate API

    alt Happy Path: Successful Payment (< 5 minutes)
        Cashier->>API: POST /payments (outcome='SUCCESS', idempotency_key)
        API->>DB: BEGIN TRANSACTION
        API->>DB: UPDATE reservations SET status='CONSUMED'
        API->>DB: UPDATE orders SET status='PAID'
        API->>DB: INSERT INTO payments (status='SUCCESS')
        API->>DB: COMMIT TRANSACTION
        API-->>Cashier: 200 OK (Order PAID, receipt generated)
    else Expired Path: Abandoned or Failed Checkout
        loop Every 5 Seconds
            Worker->>DB: SELECT * FROM reservations WHERE status='ACTIVE' AND expires_at < NOW() FOR UPDATE SKIP LOCKED
            Worker->>DB: UPDATE products SET available_stock = available_stock + qty
            Worker->>DB: UPDATE reservations SET status='RELEASED'
            Worker->>DB: UPDATE orders SET status='CANCELLED'
            Worker->>DB: COMMIT TRANSACTION
        end
    end
```

---

## 9. Concurrency Handling Explanation

To prevent **race conditions**, **lost updates**, and **overselling** when multiple registers or customers attempt to buy the last unit of an item simultaneously:

1. **Pessimistic Locking (`SELECT ... FOR UPDATE`)**:
   During the checkout transaction, the service queries all relevant product rows with `with_for_update()`. PostgreSQL locks these specific rows until the transaction commits or rolls back. Other concurrent checkout transactions attempting to read the same rows are queued until the lock is released.
2. **Atomic Verification and Deduction**:
   Inside the locked block, available stock is verified against the requested cart quantities. If any product has insufficient stock, the transaction aborts with an HTTP 400 error, and no partial reservations are committed.
3. **Deterministic Lock Ordering**:
   Product IDs are sorted in ascending lexicographical order prior to locking, preventing distributed deadlocks when two concurrent checkouts contain overlapping sets of items.
4. **Idempotent Background Sweeper**:
   The background expiration task queries due reservations using `FOR UPDATE SKIP LOCKED`. This guarantees that if multiple backend instances run concurrently, they will not contest the same expired reservation rows.

---

## 10. Payment Workflow & Idempotency

The payment endpoint (`POST /payments`) enforces idempotency using unique cryptographic client keys:

```mermaid
flowchart TD
    Req[Payment Request with Idempotency-Key] --> CheckExist{Key already exists in payments?}
    CheckExist -- Yes --> CheckStatus{Previous payment status?}
    CheckStatus -- SUCCESS --> ReturnOld[Return existing PaymentResponse with 200 OK]
    CheckStatus -- FAILED / TIMEOUT --> FailConflict[Return 409 Conflict: Cannot retry failed transaction with same key]
    CheckExist -- No --> CheckOrder{Order status == RESERVED and reservation ACTIVE?}
    CheckOrder -- No (Expired or already settled) --> Abort[Return 400 Bad Request]
    CheckOrder -- Yes --> ProcessPayment[Process Payment Outcome]
    
    ProcessPayment -- SUCCESS --> FinalizePaid[Order -> PAID, Reservation -> CONSUMED]
    ProcessPayment -- FAILED --> FinalizeFailed[Order -> CANCELLED, Stock Restored, Reservation -> RELEASED]
    ProcessPayment -- TIMEOUT --> FinalizeTimeout[Order -> CANCELLED, Stock Restored, Reservation -> RELEASED]
```

---

## 11. API Documentation

FastAPI auto-generates interactive OpenAPI documentation:

- **Swagger UI**: Accessible at `http://localhost:8000/docs`
- **ReDoc**: Accessible at `http://localhost:8000/redoc`
- **OpenAPI Schema (JSON)**: `http://localhost:8000/openapi.json` (also mirrored in `openapi-contract.json`)

### Key Endpoints Overview
| Method | Endpoint | Description | Role / Auth |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticate and obtain HttpOnly session cookie | Public |
| `GET` | `/auth/me` | Fetch active authenticated user profile | Authenticated |
| `POST` | `/auth/logout` | Revoke session and delete cookie | Authenticated |
| `GET` | `/products` | List available products | Public / Authenticated |
| `POST` | `/products` | Create new product | Manager only |
| `PUT` | `/products/{id}` | Update product details or stock | Manager only |
| `DELETE` | `/products/{id}` | Deactivate (soft delete) product | Manager only |
| `POST` | `/carts` | Create a new shopping cart | Authenticated |
| `POST` | `/carts/{id}/items` | Add or increment item in cart | Authenticated |
| `DELETE` | `/carts/{id}/items/{item_id}` | Remove item from cart | Authenticated |
| `POST` | `/carts/{id}/checkout` | Reserve inventory and initiate order | Authenticated |
| `POST` | `/payments` | Process payment outcome with idempotency | Authenticated |
| `GET` | `/orders` | List order history | Authenticated |
| `POST` | `/orders/{id}/cancel` | Cancel an unfinalized order | Manager only |
| `POST` | `/orders/{id}/refund` | Refund paid order and restore stock | Manager only |
| `GET` | `/users` | List staff user accounts | Manager only |
| `POST` | `/users` | Provision new staff account | Manager only |
| `PATCH` | `/users/{id}` | Update staff status or password | Manager only |

---

## 12. Local Installation

### Prerequisites
- **Python**: Version 3.10, 3.11, or 3.12
- **Node.js**: Version 18.x, 20.x, or 22.x+ with `npm`
- **PostgreSQL**: Version 15+ (local native service or Docker)

### Step 1: Clone or Open Directory
```bash
cd inventory-management-system
```

### Step 2: Backend Setup
Create a virtual environment and install dependencies:
```bash
# On Linux / macOS:
python3 -m venv .venv
source .venv/bin/activate

# On Windows (PowerShell):
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Install dependencies:
pip install -r requirements.txt
```

### Step 3: Frontend Setup
```bash
cd frontend
npm install
cd ..
```

---

## 13. Environment Configuration

Copy the sample environment file to create your local `.env`:
```bash
cp .env.example .env
```

Review and adjust variables in `.env`:
```env
# Database connection string
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/inventory_pos

# Environment mode ('development' or 'production')
ENVIRONMENT=development

# Frontend client URL (for CORS and cookie authorization)
FRONTEND_URL=http://localhost:5173

# Secret key for server security (must be 32+ characters in production)
SECRET_KEY=dev-insecure-secret-key-do-not-use-in-production

# Session duration in minutes
SESSION_EXPIRE_MINUTES=60

# Automatically seed default demo users on initial migration
SEED_DEMO_USERS=true
```

---

## 14. Database Setup & Migrations

### Option A: Using Docker for PostgreSQL
Start the PostgreSQL container:
```bash
docker compose up -d
```
*(Runs on mapped host port `5433` as defined in `docker-compose.yml` to prevent conflict with local databases).*

### Option B: Using Native PostgreSQL
Create the database:
```sql
CREATE DATABASE inventory_pos;
```

### Run Alembic Migrations
Apply all schema migrations up to head:
```bash
alembic upgrade head
```

#### Default Seed Accounts (Development & Testing)
When `SEED_DEMO_USERS=true`, the following credentials are automatically provisioned:
- **Manager**:
  - Email: `manager@example.com`
  - Password: `ManagerPass123!`
- **Cashier**:
  - Email: `cashier@example.com`
  - Password: `CashierPass123!`

---

## 15. Running Frontend and Backend

### Terminal 1: Backend API Server
Activate your virtual environment and start Uvicorn:
```bash
# From repository root:
uvicorn app.main:app --reload --port 8000
```
The API server will start at `http://localhost:8000`.

### Terminal 2: Frontend Development Server
```bash
# From repository root:
cd frontend
npm run dev
```
The client terminal will start at `http://localhost:5173`.

---

## 16. Testing Instructions

### Run Backend Unit & Integration Tests
The backend test suite covers API authentication, user management, cart workflows, concurrency-safe checkout, payment outcomes, handler attribution, and idempotent seeding:

```bash
# From repository root:
pytest
```

To run with verbose output and test execution timings:
```bash
pytest -v --durations=10
```

### Run Frontend Linting & Build Verification
```bash
cd frontend

# Run ESLint:
npm run lint

# Run Production TypeScript Build:
npm run build
```

---

## 17. Deployment Instructions

### Production Best Practices
1. **Security & Secrets**:
   - Set `ENVIRONMENT=production` in production.
   - Generate a cryptographically secure `SECRET_KEY` with at least 32 characters (`python -c "import secrets; print(secrets.token_hex(32))"`).
   - Set `SEED_DEMO_USERS=false` unless deploying a disposable demo sandbox.
2. **Database**:
   - Configure managed PostgreSQL (e.g., Supabase, Neon, AWS RDS, Cloud SQL) and supply the SSL connection string via `DATABASE_URL`.
   - Execute `alembic upgrade head` as part of your deployment build/release phase.
3. **Frontend Production Serving**:
   - Build client assets with `npm run build` in `frontend/`.
   - Host static files using Vercel, Netlify, Cloudflare Pages, or serve them directly behind Nginx or Caddy with Brotli/Gzip compression.

---

## 18. Screenshots Section

### Point-of-Sale Terminal Interface
The operator terminal provides real-time stock levels, high-contrast quantity controls, instantaneous cart calculations, and seamless checkout transition triggers.

### Inventory & Stock Management View
Manager-authenticated inventory ledger displaying active items, stock modification dialogs, item deactivation, and price adjustments.

### User & Session Management Ledger
Role-based administrative view for provisioning staff accounts, resetting access passcodes, and monitoring active operator sessions.

---

## License

This project is licensed under the MIT License - see the LICENSE file for details.

