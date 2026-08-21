const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const config = require('./config');
const { connectDB } = require('./config/db');
const routes = require('./routes');
const loggerMiddleware = require('./middleware/loggerMiddleware');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// Database Connection
connectDB();

// Core Middleware
app.use(
  cors({
    origin: config.clientUrl || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request Logging
if (config.nodeEnv === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(loggerMiddleware);
}

// Welcome Root Route
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to Katalyst Backend API',
    version: '1.0.0',
    documentation: {
      health: '/api/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me (Protected)'
      },
      users: {
        profile: 'GET/PUT /api/users/profile (Protected)',
        list: 'GET /api/users (Admin Only)'
      }
    }
  });
});

// API Routes
app.use('/api', routes);

// 404 and Error Handling
app.use(notFound);
app.use(errorHandler);

// Start Server
const server = app.listen(config.port, () => {
  console.log(`=========================================`);
  console.log(`🚀 Katalyst Backend running in [${config.nodeEnv}] mode`);
  console.log(`📡 Server listening on: http://localhost:${config.port}`);
  console.log(`🏥 Health check at:     http://localhost:${config.port}/api/health`);
  console.log(`=========================================`);
});

// Graceful Shutdown
const handleShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('💥 Process terminated.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = app;
