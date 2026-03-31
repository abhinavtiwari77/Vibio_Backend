# Vibio Backend API

A comprehensive mental wellness platform backend built with Node.js, Express, MongoDB, and Socket.IO. This RESTful API provides authentication, user management, social features, real-time messaging, and community support functionality.

## 🚀 Features

### Core Functionality
- **User Authentication & Authorization** - JWT-based authentication with secure password hashing
- **User Profiles** - Complete profile management with bio, interests, and profile pictures
- **Social Features** - Follow/unfollow users, like posts, and engage with content
- **Posts Management** - Create, edit, delete posts with media support (images/videos)
- **Real-time Messaging** - Socket.IO powered instant messaging between users
- **Community System** - Create and manage wellness communities with admin controls
- **Comments System** - Engage with posts through comments
- **File Upload** - Cloudinary integration for media storage
- **Rate Limiting** - Protection against abuse with configurable rate limits
- **Input Validation** - Express-validator for robust request validation

### Security Features
- Password hashing with bcrypt
- JWT token authentication
- Rate limiting on sensitive endpoints
- Input validation and sanitization
- Environment variable configuration

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB Atlas account or local MongoDB instance
- Cloudinary account for media storage
- npm or yarn package manager

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/abhinavtiwari77/HealWell_Backend.git
   cd HealWell_Backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   JWT_EXPIRES_IN=7d
   CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
   CLOUDINARY_API_KEY=your_cloudinary_api_key
   CLOUDINARY_API_SECRET=your_cloudinary_api_secret
   ```

4. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

## 📁 Project Structure

```
backend/
├── config/
│   └── db.js                 # MongoDB connection configuration
├── controllers/
│   ├── authController.js     # Authentication logic
│   ├── commentController.js  # Comments management
│   ├── communityController.js # Community features
│   ├── messageController.js  # Real-time messaging
│   ├── postController.js     # Posts CRUD operations
│   ├── uploadController.js   # File upload handling
│   └── userController.js     # User profile management
├── middleware/
│   ├── authMiddleware.js     # JWT verification
│   ├── errorMiddleware.js    # Error handling
│   ├── rateLimiter.js        # Rate limiting configuration
│   └── validate.js           # Validation middleware
├── models/
│   ├── Comment.js            # Comment schema
│   ├── Community.js          # Community schema
│   ├── Conversation.js       # Conversation schema
│   ├── Message.js            # Message schema
│   ├── Post.js               # Post schema
│   └── User.js               # User schema
├── routes/
│   ├── authRoutes.js         # Authentication endpoints
│   ├── CommentRoutes.js      # Comment endpoints
│   ├── communityRoutes.js    # Community endpoints
│   ├── messageRoutes.js      # Messaging endpoints
│   ├── postRoutes.js         # Post endpoints
│   ├── uploadRoutes.js       # Upload endpoints
│   └── userRoutes.js         # User endpoints
├── utils/
│   └── upload.js             # Cloudinary upload utilities
├── validators/
│   ├── authValidator.js      # Auth request validation
│   ├── commentValidator.js   # Comment validation
│   └── postValidator.js      # Post validation
├── .env                      # Environment variables (not tracked)
├── .gitignore               # Git ignore rules
├── package.json             # Project dependencies
└── server.js                # Application entry point
```

## 🔌 API Endpoints

### Authentication
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register new user | No |
| POST | `/api/auth/login` | User login | No |
| GET | `/api/auth/me` | Get current user | Yes |

### Users
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/user/:id` | Get user by ID | No |
| GET | `/api/user` | Search users | No |
| GET | `/api/user/me` | Get my profile | Yes |
| PUT | `/api/user/me` | Update my profile | Yes |
| POST | `/api/user/:id/follow` | Toggle follow user | Yes |

### Posts
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/posts` | Get posts feed | No |
| GET | `/api/posts/:id` | Get single post | No |
| POST | `/api/posts` | Create new post | Yes |
| PUT | `/api/posts/:id` | Edit post | Yes |
| DELETE | `/api/posts/:id` | Delete post | Yes |
| POST | `/api/posts/:id/like` | Toggle like post | Yes |

### Communities
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| GET | `/api/communities` | Get all communities | No |
| GET | `/api/communities/:slug` | Get community by slug | No |
| POST | `/api/communities` | Create community | Yes |
| PUT | `/api/communities/:slug` | Update community | Yes |
| DELETE | `/api/communities/:slug` | Delete community | Yes |
| POST | `/api/communities/:slug/join` | Join community | Yes |

### Upload
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/upload` | Upload media file | Yes |

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your_jwt_token>
```

## ⚡ Rate Limiting

- **Authentication endpoints**: 10 requests per 15 minutes
- **Write operations**: 5 requests per 10 seconds

## 🗄️ Database Schema

### User Model
- Name, email, password (hashed)
- Bio, profile picture, interests
- Followers/following lists
- Admin status
- Timestamps

### Post Model
- Author reference
- Content, media URLs
- Community reference
- Likes array
- Comments count
- Timestamps

### Community Model
- Name, slug, description
- Privacy settings
- Members, admins lists
- Pending requests
- Timestamps

### Message Model
- Sender, receiver references
- Content, attachments
- Read status
- Timestamps

## 🚧 Planned Features

### Short-term Roadmap
- [ ] Email verification for new users
- [ ] Password reset functionality
- [ ] Advanced search with filters
- [ ] Post reporting and moderation
- [ ] Notifications system
- [ ] User blocking functionality
- [ ] Comment replies and threading
- [ ] Post bookmarking/saving

### Long-term Roadmap
- [ ] Video call integration
- [ ] Professional therapist matching
- [ ] Mental health assessment tools
- [ ] Mood tracking and analytics
- [ ] Resource library (articles, videos)
- [ ] Anonymous posting option
- [ ] Multi-language support
- [ ] Mobile app API optimization
- [ ] Advanced analytics dashboard
- [ ] AI-powered content recommendations

## 🧪 Testing

```bash
# Run tests (to be implemented)
npm test
```

## 📊 Error Handling

The API returns consistent error responses:

```json
{
  "msg": "Error message description"
}
```

HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port number | Yes |
| MONGODB_URI | MongoDB connection string | Yes |
| JWT_SECRET | Secret key for JWT signing | Yes |
| JWT_EXPIRES_IN | JWT expiration time | No (default: 7d) |
| CLOUDINARY_CLOUD_NAME | Cloudinary cloud name | Yes |
| CLOUDINARY_API_KEY | Cloudinary API key | Yes |
| CLOUDINARY_API_SECRET | Cloudinary API secret | Yes |

## 🛡️ Security Considerations

- Never commit `.env` files to version control
- Use strong JWT secrets in production
- Implement HTTPS in production
- Regularly update dependencies
- Monitor rate limit violations
- Implement proper CORS configuration
- Sanitize user inputs
- Use prepared statements/parameterized queries

## 👨‍💻 Author

**Abhinav Tiwari** - [@abhinavtiwari77](https://github.com/abhinavtiwari77)

## 🙏 Acknowledgments

- Express.js team for the robust framework
- MongoDB team for the excellent database
- Socket.IO for real-time capabilities
- Cloudinary for media management
- All contributors and supporters

**Note**: This is an active project under development. Features and documentation are subject to change.
