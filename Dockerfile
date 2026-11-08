# Backend API (FastAPI) for a hosted demo. The dashboard is deployed separately (frontend/ on Vercel).
FROM python:3.12-slim

# DejaVu Sans: Unicode font for the PDF export (Lindström, CO₂e, Łódź ...)
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend backend
COPY contracts contracts

# Without the (git-ignored) Excel data pack the API serves the bundled sample review for NorthStar.
# To run the full engine, mount the pack and set LINDSTROM_DATA_PACK to its path.
ENV PORT=8000 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.api.main:app --host 0.0.0.0 --port ${PORT}"]
