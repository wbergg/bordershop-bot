CREATE TABLE items (
  id INTEGER PRIMARY KEY,
  name TEXT,
  price REAL,
  pricesek REAL,
  stockstatus TEXT,
  image TEXT,
  url TEXT,
  purchasable INTEGER,
  promotion TEXT
);

CREATE TABLE state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
