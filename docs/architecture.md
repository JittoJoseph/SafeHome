# SafeHome Architecture

## Overview

SafeHome is built entirely on Cloudflare's platform using two independent Cloudflare Workers.

The application is split into two layers:

- Frontend Worker
- Backend Worker

The frontend is responsible for the user interface, floor plan processing, and 3D rendering.

The backend is responsible for authentication, data persistence, property management, situations, and file storage.

Both workers communicate internally using Cloudflare Service Bindings.

---

# System Architecture

```
                     Cloudflare

        ┌──────────────────────────────────┐
        │                                  │
        │   Frontend Worker (Next.js)       │
        │                                  │
        │  • User Interface                │
        │  • Authentication UI             │
        │  • Floor Plan Processing         │
        │  • 3D Rendering                  │
        │                                  │
        └──────────────┬───────────────────┘
                       │
              Internal Service Binding
                       │
                       ▼
        ┌──────────────────────────────────┐
        │                                  │
        │    Backend Worker (Hono)         │
        │                                  │
        │  • Authentication                │
        │  • Property API                  │
        │  • Situation API                 │
        │  • POI API                       │
        │  • Search                        │
        │                                  │
        └───────┬───────────────┬──────────┘
                │               │
                ▼               ▼
             Cloudflare      Cloudflare
                 D1              R2
```

---

# Frontend Worker

The frontend is implemented as a Next.js application deployed as its own Cloudflare Worker.

Its responsibilities include:

- Authentication pages
- Owner dashboard
- Operator dashboard
- Responder dashboard
- Property viewer
- Situation viewer
- Floor plan upload
- Interactive 3D viewer
- POI placement
- Search interface

The frontend never communicates directly with the database or object storage.

All data access occurs through the backend worker.

---

# Backend Worker

The backend is implemented using Hono and deployed as an independent Cloudflare Worker.

It is responsible for all server-side operations.

Responsibilities include:

- User authentication
- Authorization
- Property management
- Situation management
- POI management
- Property search
- File uploads
- Database access
- Object storage access

The backend exposes all application APIs used by the frontend.

---

# Worker Communication

The frontend and backend communicate using Cloudflare Service Bindings.

This allows requests to remain entirely within Cloudflare's network.

Benefits include:

- No CORS configuration
- No public API endpoint communication
- Low latency
- Simplified authentication flow
- Reduced deployment complexity

The frontend communicates only with the backend worker.

The backend is the only component allowed to access D1 and R2.

---

# Client-side Processing

All floor plan processing is performed inside the user's browser.

The backend never generates geometry or renders models.

Processing pipeline:

```
Floor Plan Image

↓

Image Processing

↓

Wall Detection

↓

Geometry Generation

↓

3D Model

↓

Three.js Rendering
```

This allows immediate feedback without requiring server-side computation.

---

# Rendering Pipeline

The rendering pipeline is completely client-side.

The uploaded floor plan is treated as the source of truth.

The processing module generates a lightweight architectural representation consisting of:

- Floor surface
- Extruded walls
- Door openings

The renderer displays:

- Interactive camera
- Property geometry
- Homeowner POIs
- Operator POIs

No generated geometry is stored on the server.

Every time a property is opened, the model is regenerated locally from the stored floor plan.

---

# Data Storage

## Cloudflare D1

Structured application data is stored in D1.

Primary entities include:

- Users
- Properties
- POIs
- Situations

D1 serves as the application's primary relational database.

---

## Cloudflare R2

R2 stores uploaded floor plan images.

Each property maintains a single floor plan.

Uploading a new floor plan replaces the existing one.

The frontend downloads the floor plan from R2 whenever the property is opened.

---

# Authentication

Authentication is handled entirely by the backend worker.

The frontend maintains user sessions and communicates authenticated requests through the backend APIs.

Authorization is role-based.

Supported roles:

- Owner
- Operator
- Responder

---

# Search

Property search is performed by the backend.

Operators use a single search field capable of searching properties by:

- Owner name
- Property address

Matching properties are returned in real time as the user types.

---

# Points of Interest

POIs are stored independently from the rendered model.

Each POI contains:

- Property reference
- Creator
- Type
- Label
- Position

Supported creators:

- Owner
- Operator

The renderer combines the generated property model with all associated POIs when displaying the scene.

---

# Situations

A Situation represents an active emergency for a property.

Situations reference a single property.

When an operator creates a Situation, responders access the same property through the Situation interface.

Since the property always contains the latest floor plan and POIs, no snapshots or versioning are maintained.

---

# Deployment

The application consists of two Cloudflare Worker deployments.

## Frontend

- Next.js
- Cloudflare Worker

## Backend

- Hono
- Cloudflare Worker

Supporting Cloudflare services:

- D1
- R2
- Service Bindings

All infrastructure is deployed within the Cloudflare ecosystem.

---

# Design Principles

The architecture prioritizes:

- Simplicity
- Clear separation of responsibilities
- Fast client-side interaction
- Lightweight server responsibilities
- Minimal infrastructure complexity
- Cloud-native deployment
- Maintainability
