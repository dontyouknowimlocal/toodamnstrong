# Too Damn Strong

A small, opinionated dashboard tracking how unnecessarily strong the taps are at three local craft beer venues.

The site is deliberately plain static HTML, CSS, and JavaScript. It reads the daily history from `data/venue-menu-history.json` in the browser; there is no frontend build step and no generated chart output to keep in sync.

## Run locally

The data is loaded with `fetch`, so serve the repository rather than opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Updating data

`update_data.py` collects one menu snapshot per venue per day. In GitHub Actions the data workflow runs daily, commits the new snapshot, and the Pages workflow redeploys the dashboard.

The tracked venues are supplied through the `VENUES` Actions variable. Local runs also require `GITHUB_TOKEN`; `PRIVATE_REPO` and `DATA_FILE` are optional.
