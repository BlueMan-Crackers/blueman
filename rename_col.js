const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'database.db'), (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
    return;
  }
  
  db.serialize(() => {
    db.run("ALTER TABLE products RENAME COLUMN id TO Sno", (err) => {
      if (err) {
        console.error("Error renaming id to Sno:", err.message);
      } else {
        console.log("Successfully renamed 'id' column to 'Sno'.");
      }
    });
    
    db.run("ALTER TABLE products ADD COLUMN id TEXT", (err) => {
      if (err) {
        console.error("Error adding id column:", err.message);
      } else {
        console.log("Successfully added new 'id' column as TEXT.");
      }
    });
  });
});
