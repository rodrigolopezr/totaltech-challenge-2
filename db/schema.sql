-- SQLite schema (types mapped to INTEGER/TEXT)
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS proceso (
  id_proceso INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT
);

CREATE TABLE IF NOT EXISTS subproceso (
  id_subproceso INTEGER PRIMARY KEY AUTOINCREMENT,
  id_proceso INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  FOREIGN KEY (id_proceso) REFERENCES proceso(id_proceso) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS caso_uso (
  id_caso_uso INTEGER PRIMARY KEY AUTOINCREMENT,
  id_subproceso INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  descripcion TEXT,
  actor_principal TEXT,
  tipo_caso_uso INTEGER CHECK (tipo_caso_uso IN (1,2,3)),
  precondiciones TEXT,
  postcondiciones TEXT,
  criterios_de_aceptacion TEXT,
  FOREIGN KEY (id_subproceso) REFERENCES subproceso(id_subproceso) ON DELETE CASCADE
);
