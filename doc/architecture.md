# SafeTrack Architecture

This document provides a high-level overview of the SafeTrack application architecture.

## System Components

The SafeTrack system consists of four primary layers:
1. **Parent Dashboard (Client)**: A React-based web application for parents to monitor their children.
2. **Child Tracker (Tracker)**: A standalone HTML client that runs on the child's device, requesting consent and transmitting location data.
3. **Backend Server (Server)**: A Node.js and Express server that handles business logic, REST APIs, and real-time WebSocket communication.
4. **Database**: A Neon Serverless Postgres database for persistent storage.

## Architecture Diagram

```mermaid
graph TD
    %% Define Styles
    classDef frontend fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef backend fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;
    classDef database fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef tracker fill:#fce4ec,stroke:#c2185b,stroke-width:2px;

    %% Components
    subgraph ParentClient [Parent Dashboard (React / Vite)]
        UI[React Components]
        Map[Leaflet Map View]
        ReactQuery[React Query API Client]
        ParentSocket[Socket.IO Client]
        
        UI --> Map
        UI --> ReactQuery
        UI --> ParentSocket
    end
    class ParentClient frontend;

    subgraph ChildTracker [Child Tracker (Standalone HTML)]
        ConsentUI[Consent & Status UI]
        GeoAPI[Device Geolocation API]
        TrackerSocket[Socket.IO Client]
        
        ConsentUI --> GeoAPI
        GeoAPI --> TrackerSocket
    end
    class ChildTracker tracker;

    subgraph Backend [Node.js + Express Backend]
        REST[Express REST APIs]
        SocketIO[Socket.IO Server]
        
        subgraph Services
            Auth[Auth Service]
            Location[Location Ingest]
            Alerts[Alerts & Geofences]
            Consent[Consent Logging]
        end
        
        REST --> Auth
        REST --> Alerts
        REST --> Consent
        SocketIO --> Location
        Location --> Alerts
    end
    class Backend backend;

    subgraph DB [Neon Database]
        Postgres[(Serverless Postgres)]
    end
    class DB database;

    %% Connections
    ReactQuery -- "HTTPS (REST)" --> REST
    ParentSocket -- "WebSocket (Live Updates)" --> SocketIO
    TrackerSocket -- "WebSocket (Live Location)" --> SocketIO
    
    Services -- "Parameterized SQL" --> Postgres

```

## Key Interactions

- **Consent & Tracking**: The Child Tracker relies on explicit consent. Once granted, it captures device telemetry (location, battery, network) and streams it securely to the Backend via Socket.IO.
- **Real-Time Updates**: The Backend ingests location data, evaluates geofences and alerts, and broadcasts real-time updates back to the connected Parent Dashboard via Socket.IO.
- **Data Persistence**: All critical data (users, alerts, consent audit logs, location history) is stored in the Neon Serverless Postgres database via the backend services.
- **Security**: Communication happens securely over HTTPS/WSS, with JWT-based authentication in HTTP-only cookies and bcrypt for password hashing.
