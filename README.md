# NEWSWIRE

NEWSWIRE is a small web app that helps newsroom staff turn short announcements into ready-to-use TV/news tickers.

You paste in an announcement (a single one, several at once, or from a PDF file), and the app uses an AI service to write short news tickers in **English and Malayalam**. Each ticker is limited to a maximum of 10 words. You can review the suggestions, edit them, keep the ones you like, and export everything as a JSON file.

The app works even **without any AI API key** — it will show sample tickers so you can try everything out (demo mode).

---

## What it looks like inside

- **Three ways to add announcements:** type one announcement, paste a batch of them, or import a PDF file.
- **Multiple ticker options** for each announcement (up to 10), in English and Malayalam.
- **Word count badges** to see at a glance whether a ticker fits the 10-word limit.
- **Edit history** — you can undo/redo your edits (up to 20 steps).
- **Tags** — mark tickers as High / Medium / Low priority or Follow-up.
- **Export** — download the approved tickers as a JSON file.

---

## How the project is organised

```
manorama_interview/
├── backend/     <- the server that talks to the AI service
├── frontend/    <- the website you open in your browser
└── README.md
```

## What is used to build it

| Part     | Built with                          |
|----------|-------------------------------------|
| Backend  | Python, FastAPI                     |
| Frontend | React, TypeScript, Tailwind CSS, Vite |
| AI       | Google Gemini (by default) or any OpenAI-compatible service. Not needed for demo mode. |

---

## Before you start

You need two things installed on your computer:

1. **Python 3.10 or newer** — get it from https://www.python.org/downloads/
2. **Node.js 18 or newer** — get it from https://nodejs.org/

You can check whether they are installed by opening a terminal and running:

```
python --version
node --version
```

If both show a version number, you are good to go.

---

## How to run the project

You need to run **two things at the same time**, from two separate terminals:

1. the **backend** (the server)
2. the **frontend** (the website)

### Step 1 — Start the backend

Open a terminal and run these commands one by one:

```
cd backend
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --reload
```

Notes:
- On Mac/Linux, replace `copy` with `cp`.
- The last command starts the server. Leave this terminal window open.
- **You do not need to fill in the `.env` file.** Without an API key the app runs in demo mode with sample tickers. If you have a Gemini API key and want real AI output, open the `.env` file in a text editor, put your key after `GEMINI_API_KEY=`, and save.

When the backend is running you should see a message like:

```
Uvicorn running on http://127.0.0.1:8000
```

You can open http://127.0.0.1:8000/api/health in your browser to confirm it works. You won't see much there — that's fine, it just means the server is alive.

### Step 2 — Start the frontend

Open a **second** terminal (leave the first one running) and run:

```
cd frontend
npm install
npm run dev
```

When it is ready you will see a line like:

```
Local: http://localhost:5173/
```

Open that address in your browser. The app should now be usable.

---

## How to use the app (quick tour)

1. Add one or more announcements using the input box, batch paste, or PDF import.
2. Click generate to get ticker suggestions in English and Malayalam.
3. Pick the tickers you like, edit them if needed, and add tags.
4. Click export to download your approved tickers as a JSON file.

---

## Troubleshooting

**"Port already in use" or the backend won't start.**
Something else is already using port 8000. Close the other program, or restart your machine, or change the port (`--reload --port 8001`).

**The frontend opens but the app says it can't reach the server.**
The backend isn't running. Go back to the first terminal and check that the backend is still running, and that it started without errors.

**I don't have an AI API key.**
That's fine — the app runs in demo mode and shows sample tickers. No key is required to try the app.

**`npm` or `python` is not recognised.**
The required tools aren't installed, or your terminal doesn't know where they are. Reinstall Python and Node.js and make sure to tick the option to add them to your PATH (Windows).

---

## Running the tests (optional)

The backend comes with a set of tests. From inside the `backend` folder run:

```
python -m pip install pytest
python -m pytest tests -q
```

If everything passes, you will see lines ending with "passed".
