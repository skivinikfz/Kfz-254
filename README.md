# KFZ-Mechatroniker KI-Assistent — Backend

Node.js/Express Backend als sicherer Proxy zwischen Frontend und Anthropic API.

## Projektstruktur

```
kfz-backend/
├── server.js              # Express-Hauptserver
├── routes/
│   ├── analyze.js         # POST /api/analyze  → Textlösungen
│   └── pdf.js             # POST /api/generate-pdf → ausgefüllte PDF
├── middleware/
│   └── rateLimit.js       # Rate-Limiting (10 req/min pro IP)
├── .env.example           # Vorlage für Umgebungsvariablen
└── package.json
```

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---------|------|--------------|
| GET | `/` | Health-Check |
| POST | `/api/analyze` | Arbeitsblatt analysieren → JSON mit Lösungen |
| POST | `/api/generate-pdf` | Ausgefüllte PDF als Download |

### POST /api/analyze

**Form-Data:**
- `pdf` — PDF-Datei
- `subject` — Fachgebiet (z.B. "Motor & Antrieb")

**Antwort:**
```json
{
  "success": true,
  "subject": "Motor & Antrieb",
  "filename": "aufgabe1.pdf",
  "solutions": "1. Kolben\n2. Pleuel\n...",
  "tokens": { "input_tokens": 850, "output_tokens": 320 }
}
```

### POST /api/generate-pdf

**Form-Data:**
- `pdf` — Original-PDF
- `subject` — Fachgebiet

**Antwort:** Direkter PDF-Download mit Lösungsseite angehängt.

---

## Lokale Installation

```bash
# 1. In den Ordner wechseln
cd kfz-backend

# 2. Abhängigkeiten installieren
npm install

# 3. .env Datei erstellen
cp .env.example .env
# Dann ANTHROPIC_API_KEY in .env eintragen

# 4. Server starten
npm run dev
# → Läuft auf http://localhost:3001
```

---

## Deployment auf Railway (kostenlos, empfohlen)

Railway ist die einfachste Lösung für Node.js-Backends.

1. Konto erstellen: https://railway.app
2. "New Project" → "Deploy from GitHub"
3. Diesen Ordner in ein GitHub-Repo hochladen
4. In Railway: **Variables** → `ANTHROPIC_API_KEY` eintragen
5. Railway startet automatisch → du bekommst eine URL wie:
   `https://kfz-ki-backend.up.railway.app`

---

## Deployment auf Render (kostenlos)

1. Konto erstellen: https://render.com
2. "New Web Service" → GitHub-Repo verbinden
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Environment Variable: `ANTHROPIC_API_KEY`
6. Free Plan reicht für Schulprojekte

---

## Frontend anpassen

Im Frontend (React-Artifact oder eigene HTML-Datei) die API-URL ändern:

```javascript
// Lokal
const API_URL = "http://localhost:3001";

// Auf Railway/Render (deine URL einsetzen)
const API_URL = "https://kfz-ki-backend.up.railway.app";

// Arbeitsblatt analysieren (nur Text):
const formData = new FormData();
formData.append("pdf", pdfFile);
formData.append("subject", "Motor & Antrieb");

const res = await fetch(`${API_URL}/api/analyze`, {
  method: "POST",
  body: formData,
});
const { solutions } = await res.json();

// Ausgefüllte PDF herunterladen:
const res2 = await fetch(`${API_URL}/api/generate-pdf`, {
  method: "POST",
  body: formData,
});
const blob = await res2.blob();
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = "Loesungen.pdf";
a.click();
```

---

## Kosten

| Komponente | Kosten |
|------------|--------|
| Backend-Hosting (Railway Free) | 0 € |
| Anthropic API (claude-sonnet) | ~0,002 € pro Arbeitsblatt |
| 500 Arbeitsblätter/Monat | ~1 € |

Der API-Key kommt von: https://console.anthropic.com

---

## Sicherheit

- API-Key nur im Backend in `.env` — nie im Frontend!
- Rate-Limiter: 10 Anfragen/Minute pro IP
- Multer: max 20 MB, nur PDF
- CORS: nur deine Frontend-URL erlaubt (in `.env` setzen)
