# Katalyst Backend (backend-1)

A clean, modular Node.js and Express backend built with JWT authentication, RBAC, Mongoose models, and standard RESTful API conventions.

---

## 📁 Directory Structure

```
backend-1/
├── config/
│   ├── db.js                 # MongoDB connection & connection status
│   └── index.js              # Centralized configuration & environment loader
├── controllers/
│   ├── authController.js     # User registration, login, profile resolution
│   ├── userController.js     # User profiles, updates & admin user listings
│   └── healthController.js   # Server & DB health status
├── middleware/
│   ├── authMiddleware.js     # JWT verification & role authorization (student/admin)
│   ├── errorMiddleware.js    # 404 handler & global error responses
│   └── loggerMiddleware.js   # Custom request logging
├── models/
│   ├── User.js               # User schema & password hashing
│   ├── StudentProfile.js     # Student profile & interests schema
│   └── Meeting.js            # Meeting & schedule schema
├── routes/
│   ├── authRoutes.js         # /api/auth endpoints
│   ├── userRoutes.js         # /api/users endpoints
│   ├── healthRoutes.js       # /api/health endpoints
│   └── index.js              # Root router aggregator
├── .env                      # Local environment configuration
├── .env.example              # Template environment variables
├── .gitignore                # Git ignore rules
├── package.json              # Project dependencies & scripts
├── README.md                 # Documentation
└── server.js                 # Express server entry point
```

---

## 🚀 Getting Started

### 1. Navigate to the folder
```bash
cd backend-1
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
A default `.env` file is already created. You can customize variables if needed:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://127.0.0.1:27017/katalyst
JWT_SECRET=supersecretjwtkey_katalyst_2026_change_in_production
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:3000
```

### 4. Run the Server

- **Development mode (with auto-reload via nodemon):**
  ```bash
  npm run dev
  ```

- **Production / standard mode:**
  ```bash
  npm start
  ```

The server will start at: `http://localhost:5000`

---

## 📡 API Endpoints

### 🩺 Health & Root
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/` | Public | API root information |
| `GET` | `/api/health` | Public | Health status & database connection status |

### 🔐 Authentication (`/api/auth`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register new user (`name`, `email`, `password`, `role: "student" \| "admin"`) |
| `POST` | `/api/auth/login` | Public | Login with email and password, receives JWT token |
| `GET` | `/api/auth/me` | Protected | Get authenticated user info & linked profile |

### 👤 Users & Profiles (`/api/users`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/users/profile` | Protected | Get current user's profile |
| `PUT` | `/api/users/profile` | Protected | Update profile (name, bio, interests, preferences) |
| `GET` | `/api/users` | Admin only | List all users (supports pagination & role/cohort filtering) |
| `GET` | `/api/users/:id` | Admin only | Get details of a specific user |

---

## 🧪 Quick Test Examples (cURL)

### 1. Health Check
```bash
curl http://localhost:5000/api/health
```

### 2. Register a Student
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "password": "password123",
    "role": "student",
    "cohort": "Alpha",
    "batchYear": 2
  }'
```

### 3. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "jane@example.com",
    "password": "password123"
  }'
```

### 4. Access Protected Route
```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>"
```
