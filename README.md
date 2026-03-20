# Atome Bakery — Production Schedule

Auto-updating weekly production schedule pulled from Odoo SH Manufacturing Orders.

## How it works

```
Odoo SH  ──[XML-RPC API]──▶  GitHub Actions (runs 05:00 UTC daily)
                                      │
                                      ▼
                              data/schedule.json
                                      │
                                      ▼
                         GitHub Pages → index.html
```

## First-time setup

### 1. Create the GitHub repository

```bash
cd prod-schedule
git init
git add .
git commit -m "Initial commit"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_ORG/atome-prod-schedule.git
git push -u origin main
```

### 2. Enable GitHub Pages

- Go to your repo on GitHub → **Settings** → **Pages**
- Source: **Deploy from a branch** → branch: `main`, folder: `/ (root)`
- Save → your URL will be `https://YOUR_ORG.github.io/atome-prod-schedule/`

### 3. Add Odoo credentials as GitHub Secrets

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add all four:

| Secret name    | Value                                      |
|----------------|--------------------------------------------|
| `ODOO_URL`     | `https://atome-bakery.odoo.com` (your URL) |
| `ODOO_DB`      | your Odoo database name                    |
| `ODOO_USER`    | your Odoo login email                      |
| `ODOO_API_KEY` | API key from Odoo > Preferences > API Keys |

### 4. Get your Odoo API Key

1. Log in to Odoo
2. Click your **profile picture** (top right) → **My Profile** / **Preferences**
3. Scroll to **API Keys** section
4. Click **New API Key**, name it `prod-schedule`, confirm
5. **Copy the key immediately** – it's only shown once

### 5. Run the first fetch manually

In GitHub → **Actions** tab → **Refresh Production Schedule** → **Run workflow**

This generates `data/schedule.json` and commits it. The page will show live data.

### 6. Automatic refresh

The GitHub Actions workflow runs every day at **05:00 UTC** automatically.
To change the time, edit `.github/workflows/refresh.yml` (the `cron` line).

---

## Adjusting product rules

Edit `config/products.json` to update:
- **mix_offset / shape_offset / vacuum_offset** — days before D-0 (MO scheduled date)
- **dluo_months** — months after packaging for expiry (`null` = copacked/fixed DLUO)
- **dough_kg_per_pack** — kg of raw dough per pack (used to compute mixing batch counts)
- **batch_kg** in `dough_types` — kg per mixing batch

After editing, commit and push. The next daily refresh will use the updated rules.

---

## Local development / testing

```bash
# Install nothing – uses only Python stdlib
python3 scripts/fetch_schedule.py --dry-run   # empty schedule (no Odoo needed)

# With Odoo credentials
export ODOO_URL=https://atome-bakery.odoo.com
export ODOO_DB=atome-bakery
export ODOO_USER=you@atomebakery.com
export ODOO_API_KEY=your_key_here
python3 scripts/fetch_schedule.py

# Serve locally
python3 -m http.server 3456
# open http://localhost:3456
```
