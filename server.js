import express from "express";
import cors from "cors";
import multer from "multer";
import dotenv from "dotenv";
import { analyzeWorksheet } from "./routes/analyze.js";
import { generateFilledPDF } from "./routes/pdf.js";
import { rateLimiter } from "./middleware/rateLimit.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
}));
app.use(express.json({ limit: "20mb" }));

// Multer: Dateien nur im Speicher halten (kein Disk-Speicher nötig)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Nur PDF-Dateien erlaubt."));
  },
});

// ── Health Check ────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "KFZ-KI Backend", version: "1.0.0" });
});

// ── Routen ──────────────────────────────────────────────

// 1) Arbeitsblatt analysieren → gibt Textlösungen zurück
app.post(
  "/api/analyze",
  rateLimiter,
  upload.single("pdf"),
  analyzeWorksheet
);

// 2) Ausgefüllte PDF erzeugen und zurückschicken
app.post(
  "/api/generate-pdf",
  rateLimiter,
  upload.single("pdf"),
  generateFilledPDF
);

// ── Fehlerbehandlung ────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  res.status(err.status || 500).json({ error: err.message || "Interner Serverfehler" });
});

app.listen(PORT, () => {
  console.log(`✅ KFZ-KI Backend läuft auf Port ${PORT}`);
});
