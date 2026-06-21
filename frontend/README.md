# Next.js Frontend

Next.js + React + TypeScript + Tailwind CSS frontend for AI-SecOS.

## Setup

### Development

```bash
npm install
npm run dev
```

Open http://localhost:3000 with your browser to see the result.

### Production Build

```bash
npm run build
npm start
```

## Environment Variables

Create `.env.local` file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Features

- **Login/Register**: User authentication with JWT tokens
- **Dashboard**: Overview of system status and quick access
- **Assets**: Manage and view asset inventory
- **Asset Details**: View detailed asset information and risk scores
- **Policies**: Create and manage access control policies
- **Runtime Test**: Test agent access decisions in real-time
- **Responsive Design**: Works on desktop and mobile devices

## Project Structure

```
.
├── pages/                    # Next.js pages
│   ├── _app.tsx            # App wrapper
│   ├── _document.tsx        # Document wrapper
│   ├── login.tsx            # Login/Register page
│   ├── dashboard.tsx        # Dashboard page
│   ├── assets/
│   │   ├── index.tsx        # Asset listing
│   │   └── [id].tsx         # Asset details
│   ├── policies.tsx         # Policies page
│   └── runtime.tsx          # Runtime test page
├── components/              # Reusable React components
│   ├── Navbar.tsx
│   ├── Button.tsx
│   ├── Alert.tsx
│   ├── Badge.tsx
│   └── LoadingSpinner.tsx
├── lib/                     # Utility functions
│   ├── api.ts               # Axios instance
│   ├── apiClient.ts         # API endpoints
│   └── types.ts             # TypeScript types
├── styles/                  # Global styles
│   └── globals.css
├── public/                  # Static assets
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── jest.config.ts
└── Dockerfile

```

## Docker

Build image:

```bash
docker build -t ai-secos-frontend .
```

Run container:

```bash
docker run -p 3000:3000 ai-secos-frontend
```

## Technologies Used

- **Next.js 14**: React framework
- **React 18**: UI library
- **TypeScript**: Type safety
- **Tailwind CSS**: Styling
- **Axios**: HTTP client
- **react-icons**: Icon library
- **clsx**: Utility for conditional classnames

## API Integration

The frontend connects to the backend API at `NEXT_PUBLIC_API_URL`.

### API Client Features

- Automatic token injection in Authorization header
- 401 redirect to login on auth failure
- Request/response interceptors
- Error handling

### Available API Endpoints

```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
GET    /api/v1/assets
POST   /api/v1/assets
GET    /api/v1/assets/{id}
PATCH  /api/v1/assets/{id}
DELETE /api/v1/assets/{id}
GET    /api/v1/agents
POST   /api/v1/agents
GET    /api/v1/policies
POST   /api/v1/policies
GET    /api/v1/risk-scores
POST   /api/v1/runtime/decision
```

## Authentication

Tokens are stored in localStorage under the key `token`. The API client automatically includes the token in all requests.

On 401 response (Unauthorized), the user is automatically redirected to the login page.

## Development Tips

### Hot Reload

Changes to files are automatically reloaded in the browser.

### API Testing

Test API endpoints using the Runtime Test page or with curl:

```bash
# Login
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=user&password=pass"

# Get token and use it
curl -X GET http://localhost:8000/api/v1/assets \
  -H "Authorization: Bearer <token>"
```

## Troubleshooting

### Cannot connect to backend

- Check that `NEXT_PUBLIC_API_URL` is correctly set
- Verify backend is running on the correct port
- Check CORS configuration in backend

### Build errors

- Clear `.next` folder: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## License

MIT
