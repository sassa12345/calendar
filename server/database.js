const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./calendar.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the calendar database.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        title TEXT NOT NULL,
        user TEXT NOT NULL
    )`);

    // Add time column if it doesn't exist
    db.all("PRAGMA table_info(events)", (err, columns) => {
        if (err) {
            console.error("Error checking table info:", err.message);
            return;
        }
        const hasTimeColumn = columns.some(column => column.name === 'time');
        if (!hasTimeColumn) {
            db.run("ALTER TABLE events ADD COLUMN time TEXT", (err) => {
                if (err) {
                    console.error("Error adding time column:", err.message);
                } else {
                    console.log("Added 'time' column to 'events' table.");
                }
            });
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT NOT NULL UNIQUE,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL
    )`);
});

module.exports = db;
