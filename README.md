# Merit Tracker Backend

Merit Tracker Backend is a robust NestJS application that powers the Merit Tracker employee performance management system. Built with Prisma ORM and Supabase, it provides RESTful APIs for user authentication, project management, task tracking, screen monitoring, quality control, and real-time communication features.

## Features

1. **Authentication & Authorization**
   - JWT-based authentication
   - Role-based access control (Admin, QC Admin, Employee)
   - Passport strategies for local and JWT authentication
   - Secure password hashing with bcrypt

2. **Company & User Management**
   - Company registration with unique company codes
   - User registration and profile management
   - Automatic user-company association
   - User role assignment and permissions

3. **Department & Project Management**
   - CRUD operations for departments
   - Project creation and assignment within departments
   - Sub-project management with hierarchical structure
   - Multi-user collaboration on projects

4. **Task Management**
   - Task creation and assignment
   - Subtask management
   - Task status tracking (Pending, In Progress, Completed, Under Review)
   - Task submission workflow

5. **Screen Monitoring & Time Tracking**
   - Desktop agent integration for screen capture
   - Automated screenshot storage in Supabase
   - Time tracking with configurable intervals
   - Activity logs for productivity monitoring
   - Scheduled tasks for periodic tracking

6. **Quality Control System**
   - QC review workflow for submitted tasks
   - Merit points allocation system
   - Task approval and revision management
   - Performance metrics tracking

7. **Real-time Features**
   - WebSocket integration with Socket.io
   - Real-time notifications
   - Chat system for team communication
   - Live updates for task and project changes

8. **Additional Features**
   - SOPs (Standard Operating Procedures) document management
   - File upload and storage with Supabase Storage
   - Email notifications with Nodemailer
   - Leaderboard system for performance tracking
   - Activity logging and audit trails
   - API documentation with Swagger

## Tech Stack

### Backend Framework
- **Framework:** NestJS 11.0.1
- **Runtime:** Node.js
- **Language:** TypeScript 5.7.3
- **Package Manager:** pnpm

### Database & ORM
- **Database:** PostgreSQL (Supabase)
- **ORM:** Prisma 7.1.0
- **Database Adapter:** @prisma/adapter-pg
- **Type-safe Client:** @prisma/client

### Authentication & Security
- **Authentication:** Passport.js with JWT strategy
- **Password Hashing:** bcryptjs
- **JWT:** @nestjs/jwt

### Storage & File Management
- **Cloud Storage:** Supabase Storage
- **File Upload:** Multer (via @nestjs/platform-express)
- **Client:** @supabase/supabase-js

### Real-time Communication
- **WebSockets:** Socket.io
- **NestJS Gateway:** @nestjs/websockets
- **Platform:** @nestjs/platform-socket.io

### Email Service
- **Email Client:** Nodemailer 7.0.12
- **SMTP:** Gmail SMTP integration

### Validation & Transformation
- **Validation:** class-validator
- **Transformation:** class-transformer
- **Configuration:** @nestjs/config

### Additional Libraries
- **Scheduling:** @nestjs/schedule
- **API Documentation:** @nestjs/swagger
- **UUID Generation:** uuid
- **Environment Variables:** dotenv

## Project Structure
```
merit-tracker-backend/
├── dist/                      # Compiled JavaScript output
├── node_modules/              # Dependencies
├── prisma/                    # Prisma schema and migrations
│   ├── migrations/           # Database migrations
│   ├── schema.prisma         # Database schema definition
│   └── seed.ts               # Database seeding script
├── src/                       # Source code
│   ├── modules/              # Feature modules
│   │   ├── activity-logs/    # Activity tracking module
│   │   ├── auth/             # Authentication & authorization
│   │   ├── chat/             # Real-time chat system
│   │   ├── companies/        # Company management
│   │   ├── departments/      # Department management
│   │   ├── desktop-agent/    # Desktop app integration
│   │   ├── email/            # Email service
│   │   ├── leaderboard/      # Performance leaderboard
│   │   ├── notifications/    # Notification system
│   │   ├── profile/          # User profile management
│   │   ├── projects/         # Project management
│   │   ├── scheduled-tasks/  # Cron jobs & scheduled tasks
│   │   ├── screenshots/      # Screenshot management
│   │   ├── sops/             # SOPs document management
│   │   ├── storage/          # File storage service
│   │   ├── sub-projects/     # Sub-project management
│   │   ├── tasks/            # Task management
│   │   ├── time-tracking/    # Time tracking system
│   │   └── users/            # User management
│   ├── common/               # Shared utilities and decorators
│   ├── config/               # Configuration files
│   ├── guards/               # Authentication guards
│   ├── interceptors/         # Response interceptors
│   ├── filters/              # Exception filters
│   ├── app.module.ts         # Root application module
│   └── main.ts               # Application entry point
├── test/                      # E2E tests
├── .env                       # Environment variables (not in repo)
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules
├── .prettierrc               # Prettier configuration
├── eslint.config.mjs         # ESLint configuration
├── nest-cli.json             # NestJS CLI configuration
├── package.json              # Project dependencies
├── pnpm-lock.yaml            # pnpm lock file
├── prisma.config.ts          # Prisma configuration
├── tsconfig.json             # TypeScript configuration
├── tsconfig.build.json       # TypeScript build configuration
└── README.md                 # Project documentation
```

## Installation & Setup

### Prerequisites
- Node.js (v18 or higher)
- pnpm package manager
- PostgreSQL database (Supabase recommended)
- Supabase account for storage

### Backend Setup

1. **Clone the repository:**
```bash
git clone <repository-url>
cd merit-tracker-backend
```

2. **Install dependencies:**
```bash
pnpm install
```

3. **Create environment file:**
```bash
cp .env.example .env
```

4. **Configure environment variables:**

Open `.env` and add your configuration:
```env
# Database Configuration
DATABASE_URL="postgresql://user:password@host:6543/database?pgbouncer=true"
DIRECT_URL="postgresql://user:password@host:5432/database"

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRATION=7d

# Application
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:3000

# Supabase Storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=sops

# SMTP Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=noreply@merittracker.com
SMTP_TLS_CIPHERS=TLSv1.2

# File Upload Settings
UPLOAD_DESTINATION=./uploads
MAX_FILE_SIZE=10485760

# Screenshot Settings
SCREENSHOT_INTERVAL=300000
SCREENSHOTS_PER_HOUR=6

# Application URLs
APP_URL=http://localhost:3000
SUPPORT_EMAIL=support@merittracker.com
```

5. **Generate Prisma Client:**
```bash
pnpm prisma:generate
```

6. **Run database migrations:**
```bash
pnpm prisma:migrate
```

7. **Seed the database (optional):**
```bash
pnpm prisma:seed
```

8. **Start the development server:**
```bash
pnpm start:dev
```

The API should now be running at `http://localhost:3001`

### Build for Production
```bash
pnpm build
```
```bash
pnpm start:prod
```

## Running the Application

### Development Mode
```bash
pnpm start:dev
```

### Production Mode
```bash
pnpm start:prod
```

### Debug Mode
```bash
pnpm start:debug
```

## Database Management

### Generate Prisma Client
```bash
pnpm prisma:generate
```

### Create Migration
```bash
pnpm prisma:migrate
```

### Deploy Migrations
```bash
pnpm prisma:migrate:deploy
```

### Open Prisma Studio
```bash
pnpm prisma:studio
```

### Seed Database
```bash
pnpm prisma:seed
```

## Testing

### Run Unit Tests
```bash
pnpm test
```

### Run Tests in Watch Mode
```bash
pnpm test:watch
```

### Run E2E Tests
```bash
pnpm test:e2e
```

### Generate Test Coverage
```bash
pnpm test:cov
```

## API Documentation

Once the application is running, access the Swagger API documentation at:
```
http://localhost:3001/api/docs
```

## Available Scripts
```bash
# Development
pnpm start:dev          # Start development server with hot reload
pnpm start:debug        # Start development server in debug mode

# Production
pnpm build              # Build the application
pnpm start:prod         # Start production server

# Code Quality
pnpm lint               # Run ESLint
pnpm format             # Format code with Prettier

# Testing
pnpm test               # Run unit tests
pnpm test:watch         # Run tests in watch mode
pnpm test:cov           # Generate test coverage report
pnpm test:e2e           # Run end-to-end tests

# Database
pnpm prisma:generate    # Generate Prisma Client
pnpm prisma:migrate     # Run database migrations
pnpm prisma:studio      # Open Prisma Studio
pnpm prisma:seed        # Seed the database
```

## API Endpoints Overview

### Authentication
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh JWT token
- `GET /auth/profile` - Get current user profile

### Companies
- `POST /companies` - Create company
- `GET /companies` - List all companies
- `GET /companies/:id` - Get company details
- `PUT /companies/:id` - Update company
- `DELETE /companies/:id` - Delete company

### Departments
- `POST /departments` - Create department
- `GET /departments` - List departments
- `GET /departments/:id` - Get department details
- `PUT /departments/:id` - Update department
- `DELETE /departments/:id` - Delete department

### Projects
- `POST /projects` - Create project
- `GET /projects` - List projects
- `GET /projects/:id` - Get project details
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project

### Tasks
- `POST /tasks` - Create task
- `GET /tasks` - List tasks
- `GET /tasks/:id` - Get task details
- `PUT /tasks/:id` - Update task
- `POST /tasks/:id/submit` - Submit task for review
- `POST /tasks/:id/approve` - Approve task (QC Admin)
- `POST /tasks/:id/reject` - Reject task (QC Admin)

### Screenshots
- `POST /screenshots/upload` - Upload screenshot
- `GET /screenshots` - List screenshots
- `GET /screenshots/:id` - Get screenshot details

### Time Tracking
- `POST /time-tracking/start` - Start time tracking
- `POST /time-tracking/stop` - Stop time tracking
- `GET /time-tracking/logs` - Get time logs

### Leaderboard
- `GET /leaderboard` - Get leaderboard rankings
- `GET /leaderboard/user/:id` - Get user ranking

### Notifications
- `GET /notifications` - Get user notifications
- `PUT /notifications/:id/read` - Mark notification as read
- `DELETE /notifications/:id` - Delete notification

### SOPs
- `POST /sops/upload` - Upload SOP document
- `GET /sops` - List SOPs
- `GET /sops/:id` - Get SOP details
- `DELETE /sops/:id` - Delete SOP

## Key Dependencies
```json
{
  "@nestjs/common": "^11.0.1",
  "@nestjs/core": "^11.0.1",
  "@nestjs/jwt": "^10.2.0",
  "@nestjs/passport": "^10.0.3",
  "@nestjs/websockets": "^11.0.1",
  "@prisma/client": "^7.1.0",
  "@supabase/supabase-js": "^2.86.2",
  "bcryptjs": "^3.0.3",
  "class-validator": "^0.14.0",
  "passport-jwt": "^4.0.1",
  "socket.io": "^4.6.0"
}
```

## Environment Variables

Required environment variables:
```env
# Database
DATABASE_URL              # PostgreSQL connection string
DIRECT_URL               # Direct PostgreSQL connection (for migrations)

# JWT
JWT_SECRET               # Secret key for JWT tokens
JWT_EXPIRATION          # Token expiration time

# Application
NODE_ENV                # Environment (development/production)
PORT                    # Server port
FRONTEND_URL            # Frontend application URL

# Supabase
SUPABASE_URL            # Supabase project URL
SUPABASE_ANON_KEY       # Supabase anonymous key
SUPABASE_SERVICE_ROLE_KEY # Supabase service role key
SUPABASE_STORAGE_BUCKET  # Storage bucket name

# SMTP
SMTP_HOST               # SMTP server host
SMTP_PORT               # SMTP server port
SMTP_USER               # SMTP username
SMTP_PASS               # SMTP password
SMTP_FROM               # Email sender address
```

## Architecture Overview

### Module Structure
The application follows NestJS modular architecture with feature-based modules:

- **Auth Module**: Handles authentication and authorization
- **Users Module**: User management and profiles
- **Companies Module**: Company registration and management
- **Departments Module**: Department organization
- **Projects Module**: Project lifecycle management
- **Tasks Module**: Task creation, assignment, and tracking
- **Time Tracking Module**: Screen monitoring and time logs
- **Screenshots Module**: Screenshot capture and storage
- **Notifications Module**: Real-time notifications
- **Chat Module**: Team communication
- **Leaderboard Module**: Performance rankings
- **SOPs Module**: Document management
- **Email Module**: Email notifications
- **Storage Module**: File upload and management

### Database Schema
Built with Prisma ORM, featuring:
- Relational data modeling
- Type-safe database queries
- Automatic migrations
- Database seeding capabilities

### Authentication Flow
1. User registers or logs in
2. Server validates credentials
3. JWT token generated and returned
4. Client includes token in subsequent requests
5. Guards validate token on protected routes

## Troubleshooting

### If the server doesn't start:
```bash
rm -rf node_modules pnpm-lock.yaml dist
```
```bash
pnpm install
```
```bash
pnpm start:dev
```

### If database migrations fail:
```bash
pnpm prisma:generate
```
```bash
pnpm prisma:migrate:deploy
```

### If Prisma Client is out of sync:
```bash
pnpm prisma:generate
```
```bash
pnpm build
```

## Security Considerations

- All passwords are hashed using bcrypt
- JWT tokens are used for stateless authentication
- Environment variables store sensitive configuration
- CORS is configured to allow only trusted origins
- Input validation using class-validator
- SQL injection prevention through Prisma ORM
- Rate limiting on authentication endpoints (recommended)

## Performance Optimization

- Database connection pooling with PgBouncer
- Efficient database queries with Prisma
- Caching strategies for frequently accessed data
- Compressed responses
- Optimized file uploads to Supabase Storage

## Contributing

If you'd like to contribute to Merit Tracker Backend:

1. Fork the repository
2. Create a new branch (`git checkout -b feature/improvement`)
3. Make your changes
4. Write or update tests
5. Commit your changes (`git commit -am 'Add new feature'`)
6. Push to the branch (`git push origin feature/improvement`)
7. Create a Pull Request

## License

This project is licensed under the [MIT License](./LICENSE).

## Support

For support and questions, (annsabbasi54@gmail.com)

---

**Note:** Ensure all environment variables are properly configured before running the application. Never commit sensitive credentials to version control. Use `.env.example` as a template for required variables.
