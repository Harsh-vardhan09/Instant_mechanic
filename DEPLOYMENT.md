# Deployment

Backend on an AWS free-tier EC2 instance behind Caddy for TLS; frontend on Vercel.

Everything below is copy-pasteable. Replace only the values called out in **CHANGE THIS**.

---

## Why TLS is not optional

Read this before you start, because skipping it produces a failure that looks like a bug in
the app.

Vercel serves the dashboard over **HTTPS**. Browsers block any request from an HTTPS page to
a plain **HTTP** origin as *mixed content* — silently, at the network layer, before your code
runs. That includes `fetch` and the socket.io WebSocket upgrade.

If you point `NEXT_PUBLIC_API_URL` at `http://<ec2-ip>:8000`, this is what you get:

- the dashboard loads and renders its skeletons
- every panel then shows its error state, or hangs
- the Live indicator stays amber forever
- the only clue is a console line like
  `Mixed Content: The page at 'https://…' was loaded over HTTPS, but requested an insecure resource`

Nothing in the server logs. Nothing in the network tab except blocked requests. It looks
completely dead.

An IP address alone cannot fix this: Let's Encrypt does not issue certificates for bare IPs.
You need a hostname. If you do not own a domain, use a free wildcard DNS service that maps a
hostname to your IP — `sslip.io` and `nip.io` both resolve `<anything>.<ip>.sslip.io` to
`<ip>` with no signup:

```
EC2 public IP 13.51.42.7  →  hostname  api.13.51.42.7.sslip.io
```

That is a real, publicly resolvable hostname, so Let's Encrypt will issue a real certificate
for it.

---

## 1. Launch the EC2 instance

AWS Console → EC2 → **Launch instance**

| Setting | Value |
|---|---|
| Name | `instant-mechanic-api` |
| AMI | Ubuntu Server 24.04 LTS (64-bit x86) |
| Instance type | `t3.micro` (or `t2.micro` — whichever is free-tier eligible in your region) |
| Key pair | Create one, download the `.pem`, keep it |
| Storage | 16 GiB gp3 (free tier allows 30) |

### Security group — this is the part people get wrong

Create a new security group with **exactly three** inbound rules:

| Type | Port | Source | Why |
|---|---|---|---|
| SSH | 22 | **My IP** | Your address only. `0.0.0.0/0` here invites the internet to brute-force your key. |
| HTTP | 80 | `0.0.0.0/0` | Let's Encrypt's HTTP-01 challenge needs it, and Caddy redirects to HTTPS. |
| HTTPS | 443 | `0.0.0.0/0` | The actual API traffic. |

**Do not open 8000.** The API binds to `127.0.0.1:8000` and only Caddy talks to it. A public
8000 is a plain-HTTP route straight past your TLS, and anything that reaches it reaches
customer PII and revenue figures.

Outbound: leave the default (all traffic) — the instance needs to reach Postgres and
Let's Encrypt.

Note the **public IPv4 address** once it boots.

---

## 2. Install Docker

```bash
ssh -i ~/path/to/key.pem ubuntu@<EC2_PUBLIC_IP>      # CHANGE THIS
```

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git

# Docker's official repository — Ubuntu's own docker.io package lags and lacks the
# compose plugin.
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Run docker without sudo. Log out and back in for it to take effect.
sudo usermod -aG docker $USER
newgrp docker

docker --version && docker compose version
```

`t3.micro` has 1 GB of RAM and `next`/`tsc` builds can exhaust it. Add swap once:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Clone and configure

```bash
git clone https://github.com/YOUR_USER/instant-mechanic.git    # CHANGE THIS
cd instant-mechanic/backend

cp .env.example .env
```

Generate a real signing key and paste it into `.env`:

```bash
openssl rand -base64 48
```

Edit `.env` (`nano .env`) and set:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Your pooled Postgres URL (Supabase "Transaction", port 6543) |
| `JWT_SECRET` | The `openssl` output above |
| `NODE_ENV` | `production` — strips stack traces from error responses |
| `CORS_ORIGIN` | **Your exact Vercel URL**, e.g. `https://instant-mechanic.vercel.app`. Not `*`. |

You will not know the Vercel URL until step 6. Put a placeholder now and come back — the
value is read at container start, so fixing it later is `docker compose up -d` again, not a
rebuild.

`compose.yaml` runs the API **only** — no database container. Your Postgres is Supabase (or
any managed provider), so a local one would spend ~40 MB of RAM and a disk volume on a 1 GB
instance for something nothing queries. `DATABASE_URL` is required with no
fallback, so a typo fails loudly at startup instead of silently pointing at an empty database.

If you want a Postgres on your own machine for offline development, layer the override:

```bash
docker compose -f compose.yaml -f compose.local.yaml up -d
```

That adds the `db` service, makes the API wait for its healthcheck, and overrides both URLs to
point at the container. Do not use it on the server.

---

## 4. Start the API

```bash
docker compose up -d --build
docker compose ps          # api should read "healthy" within ~40s
docker compose logs -f api
```

Apply migrations and seed the first admin:

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec -e SEED_ADMIN_EMAIL=admin@yourco.com \
                     -e SEED_ADMIN_PASSWORD='a-real-password-16-chars' \
                     api node --experimental-strip-types prisma/seed.ts
```

> If `migrate deploy` hangs, your Postgres is behind a connection pooler that does not
> support advisory locks. Point `DATABASE_URL` at a non-pooled (session-mode) connection, or apply
> `prisma/migrations/*/migration.sql` through your provider's SQL editor.

Verify locally on the box — this must work before TLS will:

```bash
curl -s localhost:8000/api/health
# {"status":"ok","uptime":12,"db":"up","timestamp":"..."}
```

---

## 5. Put Caddy in front (TLS)

Pick your hostname:

- **Own a domain?** Add an `A` record for `api.your-domain.com` → your EC2 public IP. Wait
  for it to resolve (`dig +short api.your-domain.com`).
- **No domain?** Use `api.<YOUR-IP-WITH-DASHES>.sslip.io`, e.g. `api.13-51-42-7.sslip.io`.
  Nothing to configure — it already resolves.

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

Install the Caddyfile from this repo, with your hostname and email substituted:

```bash
sudo cp ~/instant-mechanic/backend/Caddyfile /etc/caddy/Caddyfile
sudo sed -i 's/api\.example\.com/api.13-51-42-7.sslip.io/' /etc/caddy/Caddyfile   # CHANGE THIS
sudo sed -i 's/you@example\.com/you@yourmail.com/'         /etc/caddy/Caddyfile   # CHANGE THIS

sudo mkdir -p /var/log/caddy && sudo chown caddy:caddy /var/log/caddy
sudo systemctl reload caddy   # or: sudo systemctl enable --now caddy
sudo systemctl status caddy --no-pager
```

Caddy requests the certificate on first start. Confirm from your laptop, not the box:

```bash
curl -s https://api.13-51-42-7.sslip.io/api/health      # CHANGE THIS
```

A valid JSON response over `https://` with no certificate warning means TLS is done.

<details>
<summary>The Caddyfile (also at <code>backend/Caddyfile</code>)</summary>

```caddyfile
{
	email you@example.com
}

api.example.com {
	reverse_proxy 127.0.0.1:8000 {
		# Without these the API sees Caddy's IP as the client and the login rate limiter
		# buckets every operator together — five bad logins anywhere locks out everyone.
		header_up X-Real-IP {remote_host}
		header_up X-Forwarded-For {remote_host}
		header_up X-Forwarded-Proto {scheme}
	}

	# socket.io's WebSocket upgrade is proxied transparently by Caddy v2 — no extra block.

	encode gzip zstd

	log {
		output file /var/log/caddy/api.log
		format json
	}
}
```

</details>

---

## 6. Deploy the frontend to Vercel

1. [vercel.com/new](https://vercel.com/new) → import the GitHub repository.
2. **Root Directory: `frontend`.** This is a monorepo; leaving it at the repo root builds the
   backend and fails.
3. Framework preset: Next.js (detected). Leave build and output settings alone.
4. Environment Variables → add:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://api.13-51-42-7.sslip.io` — **CHANGE THIS**, https, no trailing slash |

   `NEXT_PUBLIC_API_URL` is inlined at build time. Changing it later needs a **redeploy**,
   not a restart.
5. Deploy. Note the resulting URL, e.g. `https://instant-mechanic.vercel.app`.

### Close the loop on CORS

Back on the EC2 box, set the real value and restart:

```bash
cd ~/instant-mechanic/backend
nano .env            # CORS_ORIGIN="https://instant-mechanic.vercel.app"
docker compose up -d
```

Verify the API will accept that origin:

```bash
curl -si -X OPTIONS https://api.13-51-42-7.sslip.io/api/dashboard \
  -H "Origin: https://instant-mechanic.vercel.app" \
  -H "Access-Control-Request-Method: GET" | grep -i access-control-allow-origin
# access-control-allow-origin: https://instant-mechanic.vercel.app
```

If that header is missing, the browser will block every call and the dashboard will look
dead in exactly the same way mixed content does.

> Vercel gives every branch and every deployment its own URL. `CORS_ORIGIN` accepts a
> comma-separated list, so add preview origins explicitly. Do not reach for `*` — these
> responses carry customer PII.

---

## 7. Verify end to end

Open the Vercel URL and sign in.

- Overview cards show real numbers, not skeletons
- The connection pill reads **Live** in green
- DevTools → Network → WS shows a `101 Switching Protocols` on `/socket.io/`
- No mixed-content or CORS errors in the console

---

## Operating it

```bash
docker compose logs -f api          # follow logs
docker compose ps                   # health status
docker compose restart api          # restart (graceful: SIGTERM, 30s grace)
docker compose down                 # stop
git pull && docker compose up -d --build   # deploy an update
docker compose exec api npx prisma migrate deploy   # apply new migrations
```

The API handles `SIGTERM` by refusing new connections, closing websockets, draining in-flight
requests and disconnecting Prisma before exiting, so a restart does not cut an operator off
mid-dispatch.

## Costs

Free tier covers `t3.micro`/`t2.micro` for 12 months, 30 GB storage and 100 GB egress. Caddy,
Docker and Let's Encrypt are free. Vercel Hobby is free for non-commercial use. Postgres is
the one thing that may not be — Supabase's free tier pauses after a week of inactivity, which
is what makes a dashboard report `db: "down"` after a quiet week.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Dashboard loads, all panels error, Live stays amber | `NEXT_PUBLIC_API_URL` is `http://`. Mixed content. Use https. |
| Console: "blocked by CORS policy" | `CORS_ORIGIN` does not exactly match the Vercel origin. No trailing slash. |
| `curl https://…` → certificate error | DNS does not resolve to this instance, or 80/443 are closed. Caddy cannot complete the challenge. |
| `docker compose ps` shows `unhealthy` | `/api/health` returns 503 — the API is up but cannot reach Postgres. Check `DATABASE_URL`. |
| WebSocket connects then drops repeatedly | Missing/expired JWT — the socket handshake requires one. Sign in again. |
| `migrate deploy` hangs | Advisory lock through a pooler. Use a non-pooled (session-mode) connection, or apply the SQL directly. |
| Build OOM-kills on t3.micro | Add the 2 GB swap file from step 2. |
