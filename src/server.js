// @ts-check
import "dotenv/config";
// optional node-fetch polyfill for Node < 18
let _fetch = globalThis.fetch;
if (!_fetch) {
  const nodeFetch = await import("node-fetch");
  _fetch = nodeFetch.default;
}

import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const MODEL_ID = process.env.MODEL_ID || "deepseek/deepseek-chat";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.warn(
    "⚠️  Missing OPENROUTER_API_KEY. Create a .env from .env.example or use /api/analyze/mock"
  );
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

// Health check
app.get("/api/ping", (req, res) => {
  res.json({
    ok: true,
    message: "pong",
    env: { hasKey: !!OPENROUTER_API_KEY, model: MODEL_ID },
  });
});

const db = new Database(path.join(__dirname, "..", "db", "app.db"));
db.pragma("foreign_keys = ON");

// helpers
function parseModelJSON(text) {
  const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i);
  const raw = codeBlock ? codeBlock[1] : text;
  try {
    return JSON.parse(raw);
  } catch (e) {
    const first = raw.indexOf("{");
    const last = raw.lastIndexOf("}");
    if (first !== -1 && last !== -1) {
      return JSON.parse(raw.slice(first, last + 1));
    }
    throw e;
  }
}

function ensureInt(v, def = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(1, Math.round(n)), 3); // 1..3
}

// MOCK route to bypass OpenRouter (for quick local testing)
app.post("/api/analyze/mock", (req, res) => {
  const specText =
    (req.body && req.body.specText) || "Especificación de ejemplo";
  const dummy = {
    procesos: [
      {
        nombre: "Proceso Demo",
        descripcion: "Generado sin IA (mock)",
        subprocesos: [
          {
            nombre: "Subproceso Demo",
            descripcion: "Mock",
            casos_uso: [
              {
                nombre: "CU-001 Demo",
                descripcion: "Caso de uso simulado",
                actor_principal: "Usuario",
                tipo_caso_uso: 1,
                precondiciones: "Auth",
                postcondiciones: "Guardado",
                criterios_de_aceptacion: "OK",
              },
            ],
          },
        ],
      },
    ],
  };
  req.body = { specText, model: MODEL_ID, parsed: dummy };
  res.redirect(307, "/api/analyze?mock=1");
});

// Analyze + insert
app.post("/api/analyze", async (req, res) => {
  try {
    const { specText, model, parsed: incomingParsed } = req.body || {};
    if (!specText || typeof specText !== "string") {
      return res.status(400).json({ error: "specText is required" });
    }

    const modelId = model || MODEL_ID;
    const isMock = (req.query && req.query.mock === "1") || !!incomingParsed;

    let parsed;
    if (isMock) {
      parsed = incomingParsed || { procesos: [] };
    } else {
      if (!OPENROUTER_API_KEY) {
        return res
          .status(400)
          .json({
            error:
              "Falta OPENROUTER_API_KEY en .env. Usa /api/analyze/mock para probar sin IA.",
          });
      }
      const system = [
        "Eres un analista de requerimientos senior.",
        "Devuelve SOLO JSON válido que cumpla este esquema:",
        '{ "procesos": [ { "nombre": "string", "descripcion": "string", "subprocesos": [ { "nombre": "string", "descripcion": "string", "casos_uso": [ { "nombre": "string", "descripcion": "string", "actor_principal": "string", "tipo_caso_uso": 1, "precondiciones": "string", "postcondiciones": "string", "criterios_de_aceptacion": "string" } ] } ] } ] }',
        "Reglas:",
        "- tipo_caso_uso: 1=Funcional, 2=No Funcional, 3=Sistema",
        "- Máximo 6 procesos, 6 subprocesos por proceso y 8 casos de uso por subproceso.",
        "- No incluyas comentarios, ni markdown, ni texto fuera del JSON.",
      ].join("\n");

      const prompt = `Especificación del usuario:\n\n${specText}\n\nDevuelve el JSON solicitado.`;

      const response = await _fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost",
            "X-Title": "Req Analyzer Demo",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: system },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
            response_format: { type: "json_object" },
          }),
        }
      );

      if (!response.ok) {
        const e = await response.text();
        return res.status(502).json({ error: "OpenRouter error", details: e });
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content ?? "";
      parsed = parseModelJSON(content);
    }

    // Insert into DB
    const tx = db.transaction((doc) => {
      const insProc = db.prepare(
        "INSERT INTO proceso (nombre, descripcion) VALUES (?, ?)"
      );
      const insSub = db.prepare(
        "INSERT INTO subproceso (id_proceso, nombre, descripcion) VALUES (?, ?, ?)"
      );
      const insCaso = db.prepare(`INSERT INTO caso_uso 
        (id_subproceso, nombre, descripcion, actor_principal, tipo_caso_uso, precondiciones, postcondiciones, criterios_de_aceptacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

      const result = { procesos: [] };

      for (const p of doc.procesos || []) {
        const pInfo = insProc.run(p.nombre || "Proceso", p.descripcion || null);
        const pid = pInfo.lastInsertRowid;
        const pOut = { id_proceso: pid, nombre: p.nombre, subprocesos: [] };

        for (const s of p.subprocesos || []) {
          const sInfo = insSub.run(
            pid,
            s.nombre || "Subproceso",
            s.descripcion || null
          );
          const sid = sInfo.lastInsertRowid;
          const sOut = { id_subproceso: sid, nombre: s.nombre, casos_uso: [] };

          for (const c of s.casos_uso || []) {
            const tipo = ensureInt(c.tipo_caso_uso ?? 1, 1);
            const cInfo = insCaso.run(
              sid,
              c.nombre || "Caso de uso",
              c.descripcion || null,
              c.actor_principal || null,
              tipo,
              c.precondiciones || null,
              c.postcondiciones || null,
              c.criterios_de_aceptacion || null
            );
            sOut.casos_uso.push({
              id_caso_uso: cInfo.lastInsertRowid,
              nombre: c.nombre,
            });
          }
          pOut.subprocesos.push(sOut);
        }
        result.procesos.push(pOut);
      }
      return result;
    });

    const inserted = tx(parsed);
    res.json({ ok: true, parsed, inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error", details: String(err) });
  }
});

app.get("/api/tree", (req, res) => {
  const procesos = db.prepare("SELECT * FROM proceso").all();
  const subprocesos = db.prepare("SELECT * FROM subproceso").all();
  const casos = db.prepare("SELECT * FROM caso_uso").all();

  const mapSub = {};
  for (const s of subprocesos)
    mapSub[s.id_subproceso] = { ...s, casos_uso: [] };
  for (const c of casos)
    if (mapSub[c.id_subproceso]) mapSub[c.id_subproceso].casos_uso.push(c);

  const mapProc = {};
  for (const p of procesos) mapProc[p.id_proceso] = { ...p, subprocesos: [] };
  for (const s of Object.values(mapSub))
    if (mapProc[s.id_proceso]) mapProc[s.id_proceso].subprocesos.push(s);

  res.json(Object.values(mapProc));
});

app.delete("/api/reset", (req, res) => {
  db.exec(
    "DELETE FROM caso_uso; DELETE FROM subproceso; DELETE FROM proceso; VACUUM;"
  );
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
