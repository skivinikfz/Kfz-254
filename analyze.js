import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// System-Prompt mit vollem KFZ-Fachwissen
const KFZ_SYSTEM_PROMPT = `Du bist ein Experte für Kfz-Mechatroniker-Ausbildung und Handwerk (Deutschland, IHK-Standard, Berufsschule).

Dein Fachwissen umfasst:
- Motorentechnik (Otto, Diesel, Hybrid, Elektro): Takt, Ventilsteuerung, Einspritzung, Turbolader
- Elektrik & Elektronik: Schaltpläne lesen, CAN-Bus, Sensorik, Aktuatorik, Klemmenbezeichnungen (DIN 72552)
- Bremsanlagen: ABS, ESP, Bremsberechnung, Reibwerte, Bremskraftverteilung
- Motormanagement & OBD: Fehlercodes (P/B/C/U), Lambda, Zündung, Einspritzung
- Getriebe: Schaltgetriebe, Automatik, DSG, CVT, Übersetzungsberechnung
- Klimaanlage: Kältemittel (R134a, R1234yf), Kälteprozess, Verdampfer, Kompressor
- Fahrwerk: Spureinstellung, Lenkgeometrie, Stoßdämpfer, Federung
- Werkzeugkunde: Drehmomentschlüssel, Messgeräte, Multimeter, Oszilloskop
- Normen: DIN, VDE, ISO, EU-Richtlinien für Fahrzeugtechnik
- Berechnungen: Leistung, Drehmoment, Übersetzung, elektrische Größen (U=R·I, P=U·I)

Ausgabe-Format für Arbeitsblätter:
- Lückentexte: Nummerierte Liste der fehlenden Wörter → "1. Kolben  2. Pleuel  3. Kurbelwelle"
- Fragen/Antworten: "Frage 1: [vollständige Antwort]"
- Berechnungen: Formel + Rechenweg + Ergebnis mit Einheit
- Tabellen: Fehlende Zellen als "Zeile X, Spalte Y: [Wert]"
- Multiple Choice: "Aufgabe X: B" (nur der Buchstabe + 1 Satz Begründung)
- Zeichnungen/Skizzen: Beschriftung der Teile als Liste

Antworte immer auf Deutsch. Fachbegriffe korrekt und vollständig.
Kein Smalltalk, keine Erklärungen — nur die Lösungen strukturiert.`;

export async function analyzeWorksheet(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Keine PDF-Datei hochgeladen." });
    }

    const subject = req.body.subject || "Allgemeine Kfz-Technik";
    const pdfBase64 = req.file.buffer.toString("base64");

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: KFZ_SYSTEM_PROMPT + `\n\nFachgebiet dieser Aufgabe: ${subject}`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `Bearbeite dieses Kfz-Arbeitsblatt vollständig. 
Erkenne automatisch alle Aufgabentypen (Lückentext, Fragen, Berechnungen, Tabellen, Multiple Choice).
Gib alle Lösungen strukturiert aus — so dass ein Schüler sie direkt übernehmen kann.
Beginne sofort mit den Lösungen ohne Einleitung.`,
            },
          ],
        },
      ],
    });

    const solutions = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return res.json({
      success: true,
      subject,
      filename: req.file.originalname,
      solutions,
      tokens: message.usage,
    });
  } catch (err) {
    console.error("[analyze]", err);
    if (err.status === 401) {
      return res.status(401).json({ error: "Ungültiger API-Key. Prüfe deine .env Datei." });
    }
    return res.status(500).json({ error: err.message });
  }
}
