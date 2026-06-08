import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const KFZ_SYSTEM_PROMPT = `Du bist ein Experte für Kfz-Mechatroniker-Ausbildung (IHK-Standard, Deutschland).
Analysiere das Arbeitsblatt und gib die Lösungen als strukturiertes JSON zurück.

JSON-Format (EXAKT so, kein anderer Text):
{
  "type": "lueckentext" | "fragen" | "berechnung" | "tabelle" | "mixed",
  "title": "Titel des Arbeitsblatts",
  "answers": [
    { "id": "1", "label": "Lücke 1 / Frage 1 / Aufgabe a)", "value": "Die Antwort" },
    { "id": "2", "label": "Lücke 2 / Frage 2", "value": "Die Antwort" }
  ]
}

Regeln:
- Nur JSON, keine Erklärungen davor oder danach
- Alle Antworten auf Deutsch, korrekte Fachbegriffe
- Bei Berechnungen: vollständiger Rechenweg als value
- Bei Lückentexten: nur das fehlende Wort/die fehlende Phrase`;

export async function generateFilledPDF(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Keine PDF-Datei hochgeladen." });
    }

    const subject = req.body.subject || "Kfz-Technik";
    const originalPdfBytes = req.file.buffer;
    const pdfBase64 = originalPdfBytes.toString("base64");

    // ── 1. KI: Lösungen als JSON holen ─────────────────
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: KFZ_SYSTEM_PROMPT + `\nFachgebiet: ${subject}`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            { type: "text", text: "Analysiere und löse dieses Arbeitsblatt. Antworte nur mit dem JSON-Objekt." },
          ],
        },
      ],
    });

    const rawText = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    let parsed;
    try {
      const clean = rawText.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(clean);
    } catch {
      // Fallback: einfaches Text-Overlay wenn JSON fehlschlägt
      parsed = {
        type: "text",
        title: "Lösungen",
        answers: [{ id: "1", label: "Alle Lösungen", value: rawText }],
      };
    }

    // ── 2. Neue PDF erstellen: Original + Lösungsseite ──
    const originalDoc = await PDFDocument.load(originalPdfBytes);
    const outputDoc = await PDFDocument.create();

    // Original-Seiten kopieren
    const copiedPages = await outputDoc.copyPages(originalDoc, originalDoc.getPageIndices());
    copiedPages.forEach((p) => outputDoc.addPage(p));

    // Lösungsseite anhängen
    const solutionPage = outputDoc.addPage([595, 842]); // A4
    const font = await outputDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await outputDoc.embedFont(StandardFonts.Helvetica);
    const { width, height } = solutionPage.getSize();

    // Header
    solutionPage.drawRectangle({ x: 0, y: height - 60, width, height: 60, color: rgb(0.07, 0.43, 0.33) });
    solutionPage.drawText("✓ LÖSUNGSBLATT — KFZ-Mechatroniker KI", {
      x: 20, y: height - 38, size: 16, font, color: rgb(1, 1, 1),
    });
    solutionPage.drawText(`Fachgebiet: ${subject}  |  Datei: ${req.file.originalname}`, {
      x: 20, y: height - 52, size: 9, font: fontRegular, color: rgb(0.85, 1, 0.93),
    });

    // Trennlinie
    solutionPage.drawLine({ start: { x: 20, y: height - 70 }, end: { x: width - 20, y: height - 70 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });

    // Lösungen schreiben
    let y = height - 95;
    const marginLeft = 30;
    const maxWidth = width - 60;
    const lineHeight = 18;

    solutionPage.drawText(parsed.title || "Lösungen", {
      x: marginLeft, y, size: 13, font, color: rgb(0.1, 0.1, 0.1),
    });
    y -= 28;

    for (const answer of parsed.answers || []) {
      if (y < 60) break; // Seitenende

      // Label
      solutionPage.drawText(`${answer.id}. ${answer.label}`, {
        x: marginLeft, y, size: 10, font, color: rgb(0.07, 0.43, 0.33),
      });
      y -= lineHeight;

      // Wert (mehrzeilig umbrechen)
      const value = String(answer.value);
      const words = value.split(" ");
      let line = "";
      const charsPerLine = 90;

      for (const word of words) {
        if ((line + " " + word).length > charsPerLine) {
          solutionPage.drawText(line.trim(), {
            x: marginLeft + 10, y, size: 10, font: fontRegular, color: rgb(0.15, 0.15, 0.15),
          });
          y -= lineHeight;
          line = word;
          if (y < 60) break;
        } else {
          line += (line ? " " : "") + word;
        }
      }
      if (line && y >= 60) {
        solutionPage.drawText(line.trim(), {
          x: marginLeft + 10, y, size: 10, font: fontRegular, color: rgb(0.15, 0.15, 0.15),
        });
        y -= lineHeight;
      }

      // Trennlinie zwischen Aufgaben
      solutionPage.drawLine({
        start: { x: marginLeft, y: y + 4 }, end: { x: width - marginLeft, y: y + 4 },
        thickness: 0.3, color: rgb(0.9, 0.9, 0.9),
      });
      y -= 8;
    }

    // Footer
    solutionPage.drawText(`Erstellt mit KFZ-Mechatroniker KI-Assistent`, {
      x: 20, y: 20, size: 8, font: fontRegular, color: rgb(0.6, 0.6, 0.6),
    });

    // ── 3. PDF zurückschicken ───────────────────────────
    const pdfBytes = await outputDoc.save();
    const safeFilename = `Loesungen_${req.file.originalname}`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("Content-Length", pdfBytes.length);
    return res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error("[generate-pdf]", err);
    return res.status(500).json({ error: err.message });
  }
}
