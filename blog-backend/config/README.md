# Key configuration

Use this directory for local or server-only credentials.

1. Copy `keys.example.env` to `keys.env`.
2. Fill real passwords, API keys, tokens and session secrets in `keys.env`.
3. Keep `keys.env` local. It is ignored by Git and must not be uploaded.

The backend loads `blog-backend/.env` first for normal runtime settings, then loads `blog-backend/config/keys.env` for private credentials. Existing system environment variables still take priority.
