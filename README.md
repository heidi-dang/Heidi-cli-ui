# Heidi Chat

A minimal web UI for the Heidi AI backend, supporting Run and Loop modes with real-time streaming.

## Features

- **Modes**: Support for single `Run` and iterative `Loop` execution.
- **Streaming**: Real-time output via Server-Sent Events (SSE).
- **History**: View and browse past runs.
- **Configuration**: Customizable backend URL and API Key.

## Prerequisites

- Node.js (v18+)
- Running Heidi Backend (default: `http://127.0.0.1:7777`)

## Setup

1.  **Install Dependencies**

    ```bash
    npm install
    ```

    *Note: Ensure you have `react`, `react-dom`, `lucide-react`, and `vite` installed.*

2.  **Run the Application**

    ```bash
    npm run dev
    ```

    The app will start at [http://127.0.0.1:3002](http://127.0.0.1:3002).

## Configuration

### Backend URL

By default, the app connects to `http://127.0.0.1:7777`.

To change this (e.g., if using a Cloudflared tunnel or a different port):
1.  Create a `.env` file based on `.env.example`:
    ```bash
    cp .env.example .env
    ```
2.  Update `VITE_HEIDI_SERVER_BASE` in `.env`.
3.  Alternatively, go to **Settings** in the web UI (Gear icon) to override it for the current session.

### API Key

If your Heidi backend requires authentication:
1.  Go to **Settings**.
2.  Enter your **API Key**.
3.  The key will be sent via the `X-Heidi-Key` header.

## Troubleshooting

-   **CORS Errors**: Ensure your Heidi backend allows CORS for `http://127.0.0.1:3002`.
-   **Connection Failed**: Verify the backend is running and the URL in Settings is correct.