import express from "express";
import cors from "cors";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const app = express();
const PORT = process.env.PORT || 3001;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: "20mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Nur PDF-Dateien erlaubt."));
  },
});

const KFZ_SYSTEM_PROMPT = `Du bist ein Experte für Kfz-Mechatroniker-Ausbildung (IHK-Standard, Deutschland).
Dein Fachwissen: Motorentechnik, Elektrik, Bremsen, OBD-Diagnose, Getriebe, Klimaanlage, Fahrwerk, Werkzeugkunde.
Beantworte alle Fragen und Lücken im Arbeitsblatt präzise auf Deutsch.
Korrekte Fachbegriffe, keine Erklärungen — nur die Lösungen strukturiert.
Format: "1. [Antwort]", "2. [Antwort]" usw.`;

// Health Check
app.get("/", (req, res) => {
  res.json({ status: "ok", service: "KFZ-KI Backend" });
});

// Arbeitsblatt analysieren → Textlösungen
app.post("/api/analyze", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Keine PDF hochgeladen." });

    const subject = req.body.subject || "Kfz-Technik";
    const pdfBase64 = req.file.buffer.toString("base64");

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: KFZ_SYSTEM_PROMPT + `\nFachgebiet: ${subject}`,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Bearbeite dieses Arbeitsblatt vollständig. Gib alle Lösungen nummeriert aus." }
        ]
      }]
    });

    const solutions = message.content.filter(b => b.type === "text").map(b => b.text).join("\n");
    res.json({ success: true, subject, filename: req.file.originalname, solutions });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Ausgefüllte PDF generieren
app.post("/api/generate-pdf", upload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Keine PDF hochgeladen." });

    const subject = req.body.subject || "Kfz-Technik";
    const originalPdfBytes = req.file.buffer;
    const pdfBase64 = originalPdfBytes.toString("base64");

    // KI Lösungen holen
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: KFZ_SYSTEM_PROMPT + `\nFachgebiet: ${subject}`,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdfBase64 } },
          { type: "text", text: "Bearbeite dieses Arbeitsblatt. Gib alle Lösungen nummeriert aus." }
        ]
      }]
    });

    const solutions = message.content.filter(b => b.type === "text").map(b => b.text).join("\n");

    // Original PDF + Lösungsseite
    const originalDoc = await PDFDocument.load(originalPdfBytes);
    const outputDoc = await PDFDocument.create();

    const copiedPages = await outputDoc.copyPages(originalDoc, originalDoc.getPageIndices());
    copiedPages.forEach(p => outputDoc.addPage(p));

    // Lösungsseite
    const page = outputDoc.addPage([595, 842]);
    const font = await outputDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg = await outputDoc.embedFont(StandardFonts.Helvetica);
    const { height } = page.getSize();

    // Header grün
    page.drawRectangle({ x: 0, y: height - 60, width: 595, height: 60, color: rgb(0.07, 0.43, 0.33) });
    page.drawText("LOESUNGSBLATT — KFZ-Mechatroniker KI", { x: 20, y: height - 38, size: 15, font, color: rgb(1,1,1) });
    page.drawText(`Fachgebiet: ${subject}`, { x: 20, y: height - 52, size: 9, font: fontReg, color: rgb(0.85,1,0.93) });

    // Lösungen schreiben
    let y = height - 90;
    const lines = solutions.split("\n");
    for (const line of lines) {
      if (y < 40) break;
      if (line.trim()) {
        page.drawText(line.substring(0, 95), { x: 20, y, size: 10, font: fontReg, color: rgb(0.1,0.1,0.1) });
        y -= 16;
      } else {
        y -= 8;
      }
    }

    const pdfBytes = await outputDoc.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="Loesungen_${req.file.originalname}"`);
    res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`KFZ-KI Backend laeuft auf Port ${PORT}`));
