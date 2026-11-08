# Deploying the demo (free: Render for the API, Vercel for the dashboard)

About 10 minutes, all in the browser, signing in with GitHub. Result: a public **Demo URL** (the Vercel link).

## 1. Backend API on Render

1. Go to https://dashboard.render.com, sign in with GitHub.
2. **New → Blueprint**, pick the repository `since-ai-26`, branch `main`. Render reads [`render.yaml`](../render.yaml) and builds the [`Dockerfile`](../Dockerfile).
3. When asked for `GEMINI_API_KEY`: leave it **empty** for a public demo (templates only, no cost risk), or paste a key with a usage limit set in Google AI Studio.
4. **Apply**. When the build finishes, copy the service URL, e.g. `https://lindstrom-review-api.onrender.com`.
5. Check: open `<URL>/api/health`. Expected: `{"status":"ok","excel_pack_present":false,...}`.

Without the data pack the API serves the bundled NorthStar review, and the dashboard offers only NorthStar. All features work for it, including PPTX/PDF export.

**Optional, full engine for all three customers:** in the Render service, **Environment → Secret Files → Add**, file name `Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx`, upload the data pack, save, then **Manual Deploy → Deploy latest commit**. `/api/health` then shows `"excel_pack_present": true`. (The data pack stays out of Git.)

The free plan sleeps after about 15 minutes idle; the first request then takes up to a minute. The dashboard shows the bundled sample meanwhile and switches to the live API by itself. Open the demo once a few minutes before judging to wake it.

## 2. Dashboard on Vercel

1. Go to https://vercel.com/new, sign in with GitHub, import `since-ai-26`.
2. **Root Directory:** `frontend` (Framework: Next.js is detected).
3. **Environment Variables:** `NEXT_PUBLIC_API_URL` = the Render URL from step 1 (no trailing slash).
4. **Deploy**. The project URL (e.g. `https://since-ai-26.vercel.app`) is the **Demo URL**.
5. Check: the sidebar says **Live engine (FastAPI)**, and **Download for customer (PPTX)** in step 6 downloads a deck.

If `NEXT_PUBLIC_API_URL` changes later, redeploy on Vercel (it is built into the page).

## Quick fallback

The dashboard also runs with no API at all (sample data, everything except export): deploy only step 2 without `NEXT_PUBLIC_API_URL`.
