# N8N + Supabase

- The `APP_PORT` is where the app is run on `127.0.0.1` (defaults to `8010`).
- The Supabase instance is at `https://127.0.0.1:$APP_PORT/`.
- The N8N instance is at `https://127.0.0.1:$APP_PORT/n8n`
- Always use `http://kong:8000` inside the N8N when configuring the Supabase connection.
- The N8N data is stored in the same Supabase database for simplicity (tables are prefixed with `n8n_`).

## Usage

Start

```bash
docker compose up
```

Stop

```bash
docker compose down
```
