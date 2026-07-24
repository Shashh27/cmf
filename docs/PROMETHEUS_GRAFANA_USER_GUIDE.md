# Prometheus & Grafana — How to Use (CMF Scheduling API)

Practical guide for using monitoring **correctly and effectively**.  
Not a theory document — follow the steps in order.

**Related files**

| Path | Role |
|------|------|
| `backend/cmf/main.py` | Exposes `GET /metrics` |
| `backend/cmf/monitoring/docker-compose.yml` | Starts Prometheus + Grafana |
| `backend/cmf/monitoring/prometheus.yml` | Tells Prometheus where to scrape |

---

## 1. What each tool is for (keep this mental model)

| Tool | You use it to… | You do **not** use it to… |
|------|----------------|---------------------------|
| **`/metrics`** | Confirm the API is exporting numbers | Analyse trends (raw text only) |
| **Prometheus** | Check scrape health + run one-off queries | Build pretty long-term charts (use Grafana) |
| **Grafana** | Watch live dashboards (rate, latency, errors) | Generate load (use the UI/Swagger or k6 later) |
| **App logs** | See *what business event* happened | Measure p95 latency |

**Rule:** Grafana = eyes. Prometheus = engine. Logs = story. Swagger/UI = traffic generator.

---

## 2. Correct startup order (every time)

Do these **in this order**. Wrong order is the #1 reason targets show DOWN.

### Step A — Start Docker Desktop

Wait until Docker is fully running (whale icon steady).

### Step B — Start the API (must listen on all interfaces)

```powershell
cd "D:\Harshith\CMF Digitalization\backend\cmf"
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8989 --reload
```

**Important:** use `--host 0.0.0.0` (not only `172.18.7.85`).  
Docker scrapes via `host.docker.internal`. Binding only to the LAN IP breaks scraping.

LAN access still works: `http://172.18.7.85:8989`

Confirm startup log includes:

```text
Prometheus metrics available at /metrics
```

### Step C — Start Prometheus + Grafana

```powershell
cd "D:\Harshith\CMF Digitalization\backend\cmf\monitoring"
docker compose up -d
```

### Step D — 60-second health check

| Check | URL | Expect |
|-------|-----|--------|
| API alive | http://172.18.7.85:8989/health | `{"status":"healthy",...}` |
| Metrics export | http://172.18.7.85:8989/metrics | Prometheus text (not 404) |
| Prometheus ready | http://localhost:9090/-/ready | `Prometheus Server is Ready.` |
| Scrape target | http://localhost:9090/targets | `cmf-scheduling-api` = **UP** |
| Grafana | http://localhost:3002 | Login page |

**Grafana login:** `admin` / `admin` (change later if needed).

If the target is **DOWN**, stop and fix that before opening Grafana (section 8).

---

## 3. Stop / restart cleanly

```powershell
cd "D:\Harshith\CMF Digitalization\backend\cmf\monitoring"
docker compose ps          # see status
docker compose restart     # restart both
docker compose down        # stop (keeps metric history in Docker volumes)
docker compose down -v     # stop AND wipe history (rare)
```

API: `Ctrl+C` in the uvicorn terminal.

---

## 4. How to use Grafana effectively (main UI)

### 4.1 Open the ready-made dashboard

1. Go to http://localhost:3002  
2. Login `admin` / `admin`  
3. Left menu → **Dashboards**  
4. Open folder **CMF** → **CMF Scheduling API**

You should see four panels:

| Panel | Meaning | Healthy look |
|-------|---------|--------------|
| **Request rate** | Requests per second by endpoint | Lines move when you use the app |
| **Latency p95** | 95% of requests finish under this time | Mostly low; spikes on heavy ops (reschedule) |
| **HTTP status codes** | 2xx / 4xx / 5xx rate | Mostly 2xx; investigate rising 5xx |
| **In-progress requests** | Concurrent requests right now | Near 0 at idle; rises under load |

Set time range (top-right) to **Last 15 minutes** and refresh **10s** while testing.

### 4.2 Correct way to “see something happen”

Grafana stays flat until the API receives **real business calls**.

1. Keep Grafana open on the dashboard  
2. In another tab open Swagger: http://172.18.7.85:8989/docs  
3. Call a few endpoints, for example:  
   - any `GET` list endpoint  
   - job card activate  
   - production log submit / review  
4. Wait **15–30 seconds** (Prometheus scrapes every 15s)  
5. Watch Grafana panels update  

**Do not** expect `/metrics` alone to fill the graphs — `/metrics` and `/health` are excluded from HTTP metrics on purpose.

### 4.3 How to read the graphs (effective interpretation)

| What you see | What it means | What to do |
|--------------|---------------|------------|
| Flat / empty | No API traffic yet, or target DOWN | Hit Swagger; check `/targets` |
| Rate spikes when you click UI | Working correctly | Normal |
| p95 jumps on review / reschedule | Heavy path is slow | Note the endpoint; later profile |
| Status `5xx` rising | Server errors under use | Check uvicorn logs + that endpoint |
| In-progress stuck high | Requests hanging / blocked | Check DB locks, long reschedule |

**Useful habit:** before a test, note the time. After the test, set Grafana range to that window only.

---

## 5. How to use Prometheus (when Grafana is not enough)

Open http://localhost:9090

### 5.1 Targets page (use often)

http://localhost:9090/targets

| State | Meaning |
|-------|---------|
| **UP** | Scraping OK — proceed to Grafana |
| **DOWN** | Fix network/API first (section 8) |

### 5.2 Graph / query page (one-off checks)

http://localhost:9090/graph

Paste a query → **Execute** → switch to **Graph** tab.

**Useful queries for CMF**

```promql
# Is the API scrape healthy? (1 = up)
up{job="cmf-scheduling-api"}

# Requests per second (all endpoints)
sum(rate(http_requests_total[1m]))

# Requests per second by handler
sum(rate(http_requests_total[1m])) by (handler, method)

# Error-ish responses (grouped status)
sum(rate(http_requests_total{status=~"5.."}[5m])) by (handler)

# p95 latency by handler
histogram_quantile(
  0.95,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le, handler)
)

# Currently in-flight requests
sum(http_requests_inprogress) by (handler, method)
```

**Tip:** Prefer Grafana for continuous watching. Use Prometheus Graph when you want a quick answer to one question.

---

## 6. Effective testing workflows

### Workflow A — Smoke (5 minutes)

1. Startup order (section 2)  
2. Target **UP**  
3. Call 5–10 Swagger endpoints  
4. Grafana: request rate > 0, mostly 2xx  

**Pass:** graphs move, no 5xx spike.

### Workflow B — Shop-floor path (responsiveness)

1. Open Grafana (Last 15m)  
2. Run: activate job card → submit production log → review status  
3. Watch **Latency p95** for those handlers  

**Pass:** activate/submit feel snappy; review+reschedule may be slower (expected).

### Workflow C — Reliability soak (30–60 minutes)

1. Leave API + monitoring running  
2. Use the real frontend normally  
3. Every 10 minutes glance at Grafana:  
   - 5xx still near zero?  
   - p95 not steadily climbing?  
4. Optionally keep an eye on uvicorn memory in Task Manager  

**Pass:** no rising error rate / no climbing latency over the hour.

### Workflow D — Compare before/after a code change

1. Note p95 for key handlers before change  
2. Deploy/restart API  
3. Repeat same Swagger calls  
4. Compare Grafana windows  

---

## 7. What “good” looks like (starter SLOs)

Tune later for your plant; these are starting points:

| Path | Suggested p95 | Notes |
|------|---------------|-------|
| Simple GET lists | &lt; 300–500 ms | Should be fast |
| Job card activate | &lt; 1 s | Includes DB checks |
| Production log submit | &lt; 1 s | |
| Production review + dynamic reschedule | &lt; 2–5 s | Heavier; depends on active parts |
| Generate full schedule | Separate budget | Can be slow — measure alone |

| Reliability | Target |
|-------------|--------|
| 5xx rate under normal use | Near 0 |
| Scrape target | Always UP while testing |

---

## 8. Troubleshooting (common confusion)

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `/metrics` is **404** | Metrics gated / old process | Restart uvicorn; ensure `should_respect_env_var=False` in `main.py` |
| `/metrics` works but Grafana empty | No business traffic yet | Call Swagger APIs; wait 30s |
| Target **DOWN** (`connection refused`) | API not running, or `--host 172.18.7.85` only | Start API with `--host 0.0.0.0` |
| Target **DOWN** (`no route to host`) | Docker cannot reach bound IP | Use `0.0.0.0` + `host.docker.internal` in `prometheus.yml` |
| `ModuleNotFoundError: prometheus_fastapi_instrumentator` | Installed in wrong Python | `.\venv\Scripts\python.exe -m pip install -r requirements.txt` |
| Docker compose fails | Docker Desktop not running | Start Docker Desktop first |
| Grafana login fails | Wrong password / first-time | `admin` / `admin` |
| Dashboard missing | Provisioning not loaded | `docker compose down` then `up -d`; check folder **CMF** |
| Numbers look “old” after restart | Prometheus still has prior series | Normal; filter time range to “Last 15 minutes” |

### Quick PowerShell checks

```powershell
# Metrics HTTP code (expect 200)
curl.exe -s -o NUL -w "%{http_code}" http://172.18.7.85:8989/metrics

# Target health
curl.exe -s http://localhost:9090/api/v1/targets
```

---

## 9. What not to do

- Do **not** treat raw `/metrics` text as your daily monitoring UI  
- Do **not** bind uvicorn only to the LAN IP while using Docker scrape  
- Do **not** expect Grafana to create load — it only observes  
- Do **not** ignore a DOWN target and “tune panels” — fix scrape first  
- Do **not** confuse access logs (`INFO: 172... "POST ..."`) with Prometheus metrics  

---

## 10. Daily cheat sheet

```text
1. Docker Desktop ON
2. uvicorn --host 0.0.0.0 --port 8989 --reload
3. cd monitoring → docker compose up -d
4. http://localhost:9090/targets  → must be UP
5. http://localhost:3002          → CMF Scheduling API dashboard
6. Use Swagger/UI                 → watch graphs move
```

| URL | Purpose |
|-----|---------|
| http://172.18.7.85:8989/docs | Generate traffic |
| http://172.18.7.85:8989/metrics | Confirm export |
| http://localhost:9090/targets | Scrape health |
| http://localhost:9090/graph | Ad-hoc PromQL |
| http://localhost:3002 | Main monitoring UI |

---

## 11. Next level (later)

When basic dashboards feel comfortable:

1. Add **alerts** in Grafana (e.g. 5xx rate &gt; 0 for 5 minutes)  
2. Add **custom metrics** for dynamic reschedule duration (business-critical)  
3. Add **k6** load tests and watch the same Grafana panels during the run  
4. Change default Grafana password for shared machines  

Until then: **Targets UP → generate traffic → read Grafana** is the effective loop.
