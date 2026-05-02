const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
require('express-async-errors');

const apiRoutes = require('./src/routes/api');

const app = express();

// Configuration
const port = process.env.PORT || 8000;
const origins = process.env.CORS_ALLOW_ORIGINS 
  ? process.env.CORS_ALLOW_ORIGINS.split(',').map(o => o.trim())
  : ['http://127.0.0.1:8000', 'http://localhost:8000'];

const corsOptions = {
  origin: origins,
  credentials: !origins.includes('*'),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['*']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/static', express.static(path.join(__dirname, 'static')));

// API Routes
app.use('/', apiRoutes);

// Frontend Routes
app.get('/', (req, res) => {
  res.redirect('/service/bazi');
});

app.get('/service/:module_id', (req, res) => {
  res.sendFile(path.join(__dirname, 'templates', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(`Unhandled server error path=${req.path}`, err);
  if (err.name === 'ZodError') {
    return res.status(422).json({ detail: err.errors });
  }
  if (err.status) {
    return res.status(err.status).json({ detail: err.message });
  }
  const trace_id = require('crypto').randomUUID().replace(/-/g, '');
  res.status(500).json({ detail: 'Internal Server Error', trace_id });
});

app.listen(port, () => {
  console.log(`Master Node.js server running on port ${port}`);
});
