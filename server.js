require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// Serve static files from the current directory (HTML, CSS, Images, etc.)
app.use(express.static(path.join(__dirname, '.')));

// Initialize Database
const db = new Database(path.join(__dirname, 'database.db'));

try {
  db.exec(`CREATE TABLE IF NOT EXISTS products (
    Sno INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT,
    name TEXT,
    category TEXT,
    image TEXT,
    price REAL,
    discount REAL
  )`);
  
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT
  )`);
  
  db.exec(`CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT PRIMARY KEY,
    token TEXT,
    expires_at INTEGER
  )`);
  
  console.log('Connected to the SQLite database.');
  
  // Seed the database if it's empty
  const countStmt = db.prepare("SELECT COUNT(*) as count FROM products");
  const result = countStmt.get();
  
  if (result.count === 0) {
    console.log("Seeding database with initial products...");
    const insert = db.prepare("INSERT INTO products (id, name, category, image, price, discount) VALUES (?, ?, ?, ?, ?, ?)");
    insert.run("P001", "15cm Electric Sparklers", "Sparklers", "https://images.unsplash.com/photo-1543884846-99cb29bdf3cc?q=80&w=600&auto=format&fit=crop", 150, 10);
    insert.run("P002", "Color Koti (Flower Pot)", "Fountains", "https://images.unsplash.com/photo-1605333583344-77a840c572e4?q=80&w=600&auto=format&fit=crop", 350, 15);
    insert.run("P003", "12 Shots Multi-Color", "Night Sky", "https://images.unsplash.com/photo-1498429152472-9a433d9ddf3b?q=80&w=600&auto=format&fit=crop", 850, 5);
    insert.run("P004", "1000 Wala Garland", "Garlands", "https://images.unsplash.com/photo-1577903251410-a178fb313dd7?q=80&w=600&auto=format&fit=crop", 1200, 20);
    console.log("Database seeded successfully.");
  }
} catch (err) {
  console.error('Database initialization error:', err.message);
}

// Function to start the Express server
function startServer() {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

// API endpoint for User Signup
app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const insert = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
    insert.run(name, email, hashedPassword);
    res.status(201).json({ message: "User registered successfully." });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: "Email already exists." });
    }
    res.status(500).json({ error: error.message || "Server error during registration." });
  }
});

// API endpoint for User Login
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const getUser = db.prepare("SELECT * FROM users WHERE email = ?");
    const user = getUser.get(email);
    
    if (!user) {
      return res.status(400).json({ error: "Invalid email or password." });
    }

    bcrypt.compare(password, user.password, (err, match) => {
      if (err) {
        return res.status(500).json({ error: "Server error during login." });
      }
      if (match) {
        res.json({ message: "Login successful", name: user.name, email: user.email });
      } else {
        res.status(400).json({ error: "Invalid email or password." });
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Server error during login." });
  }
});

// API endpoint for Forgot Password
app.post('/api/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required." });

  try {
    const getUser = db.prepare("SELECT * FROM users WHERE email = ?");
    const user = getUser.get(email);
    
    if (!user) {
      // Return 200 even if user doesn't exist for security
      return res.json({ message: "If your email is in our system, a reset link has been sent." });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 3600000; // 1 hour

    const insertReset = db.prepare("INSERT OR REPLACE INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)");
    insertReset.run(email, token, expiresAt);

    const resetLink = `http://127.0.0.1:3000/reset-password.html?token=${token}&email=${encodeURIComponent(email)}`;
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: email,
      subject: "Password Reset - BLUE MAN Crackers",
      text: `You requested a password reset. Click the link below to reset your password:\n\n${resetLink}\n\nThis link will expire in 1 hour.\nIf you did not request this, please ignore this email.`
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error("Error sending email:", error);
        return res.status(500).json({ error: "Failed to send email." });
      }
      res.json({ message: "If your email is in our system, a reset link has been sent." });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API endpoint for Reset Password
app.post('/api/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const getReset = db.prepare("SELECT * FROM password_resets WHERE email = ? AND token = ?");
    const record = getReset.get(email, token);
    
    if (!record) return res.status(400).json({ error: "Invalid or expired reset token." });
    
    if (Date.now() > record.expires_at) {
      const deleteReset = db.prepare("DELETE FROM password_resets WHERE email = ?");
      deleteReset.run(email);
      return res.status(400).json({ error: "Reset token has expired. Please request a new one." });
    }

    bcrypt.hash(newPassword, 10, (err, hashedPassword) => {
      if (err) {
        return res.status(500).json({ error: "Server error during password reset." });
      }
      
      const updateUser = db.prepare("UPDATE users SET password = ? WHERE email = ?");
      updateUser.run(hashedPassword, email);
      
      const deleteReset = db.prepare("DELETE FROM password_resets WHERE email = ?");
      deleteReset.run(email);
      
      res.json({ message: "Password reset successfully. You can now log in." });
    });
  } catch (error) {
    res.status(500).json({ error: "Server error during password reset." });
  }
});

// API endpoint to GET all products
app.get('/api/products', (req, res) => {
  try {
    const getAll = db.prepare("SELECT * FROM products");
    const rows = getAll.all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to UPDATE a product price and discount
app.put('/api/products/:Sno', (req, res) => {
  const { price, discount } = req.body;
  const Sno = req.params.Sno;
  
  try {
    const update = db.prepare("UPDATE products SET price = ?, discount = ? WHERE Sno = ?");
    const info = update.run(price, discount, Sno);
    res.json({ message: "Product updated", changes: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to CREATE a new product
app.post('/api/products', (req, res) => {
  const { id, name, category, price, discount, image } = req.body;
  
  if (!name || !category || price === undefined) {
    return res.status(400).json({ error: "Name, category, and price are required." });
  }

  const defaultImage = image || "https://images.unsplash.com/photo-1543884846-99cb29bdf3cc?q=80&w=600&auto=format&fit=crop";
  const finalDiscount = discount || 0;

  try {
    const insert = db.prepare("INSERT INTO products (id, name, category, image, price, discount) VALUES (?, ?, ?, ?, ?, ?)");
    const info = insert.run(id || null, name, category, defaultImage, price, finalDiscount);
    res.status(201).json({ message: "Product created", id: info.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to DELETE a product
app.delete('/api/products/:Sno', (req, res) => {
  const Sno = req.params.Sno;
  
  try {
    const del = db.prepare("DELETE FROM products WHERE Sno = ?");
    const info = del.run(Sno);
    res.json({ message: "Product deleted", changes: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API endpoint to DELETE a category
app.delete('/api/products/category/:category', (req, res) => {
  const category = req.params.category;
  
  try {
    const del = db.prepare("DELETE FROM products WHERE category = ?");
    const info = del.run(category);
    res.json({ message: "Category deleted", changes: info.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Setup Nodemailer Transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// API endpoint to send emails
app.post('/api/send-email', (req, res) => {
  const { subject, message } = req.body;
  
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || process.env.GMAIL_APP_PASSWORD === 'your_16_character_app_password_here') {
    return res.status(500).json({ error: "Email credentials not configured in .env file." });
  }

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER, // sending to yourself
    subject: subject || "New Inquiry - BLUE MAN Crackers",
    text: message
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: error.message });
    } else {
      res.json({ message: "Email sent successfully!" });
    }
  });
});

startServer();

