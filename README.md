# Analizador de Requerimientos con IA (Node + Express + SQLite + OpenRouter)

Implementa una página simple que envía la especificación a un modelo gratuito en OpenRouter y guarda en SQLite:
- **procesos**
- **subprocesos**
- **casos_uso**

## Requisitos
- Node 18+
- Cuenta y **API key** de [OpenRouter](https://openrouter.ai/)

## Setup rápido

```bash
git clone <repo-o-descomprime-el-zip>
cd req-analyzer-openrouter

# 1) Dependencias
npm i

# 2) Crear .env desde ejemplo
cp .env.example .env
# Edita OPENROUTER_API_KEY y (opcional) MODEL_ID / PORT

# 3) Inicializar base SQLite
npm run init:db

# 4) Correr servidor
npm run dev
# o
npm start
```

Abre: http://localhost:3000

## Modelos gratuitos sugeridos (coloca en MODEL_ID o elige en la UI)
- `deepseek/deepseek-chat` (DeepSeek V3.1 free)
- `openai/gpt-oss-20b`
- `zhipuai/glm-4-5-air`
- `qwen/qwen-2.5-coder-32b-instruct`

> **Nota:** Los IDs exactos pueden cambiar según OpenRouter. Si un modelo falla, prueba otro de la lista o visita su catálogo para confirmar el ID.

## Endpoints

- `POST /api/analyze`
  ```json
  { "specText": "texto", "model": "opcional-id-modelo" }
  ```
  Llama al modelo, intenta parsear JSON y guarda en DB. Responde con `parsed` e `inserted`.

- `GET /api/tree`
  Devuelve el árbol completo guardado.

- `DELETE /api/reset`
  Limpia tablas (con `VACUUM`).

## Esquema (SQLite)
- Se adaptó a tipos `INTEGER`/`TEXT` con `AUTOINCREMENT` y `FOREIGN KEY` con `ON DELETE CASCADE`.

## Seguridad y límites
- Este demo guarda todo lo que devuelva el modelo. Para producción: validar con un esquema (p.ej. Zod/Ajv), sanitizar longitudes y manejar duplicados.

## Licencia
MIT
