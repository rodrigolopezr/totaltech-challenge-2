// @ts-check
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, '..', 'db', 'app.db');
const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');

fs.mkdirSync(path.join(__dirname, '..', 'db'), { recursive: true });
const db = new Database(dbPath);
const schema = fs.readFileSync(schemaPath, 'utf8');
db.exec(schema);
console.log('SQLite database initialized at', dbPath);
db.close();
