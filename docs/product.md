# SafeHome

## Overview

SafeHome is a platform that helps first responders quickly understand the layout of a home during an emergency.

Homeowners upload a simple 2D floor plan of their property, and the platform automatically generates a lightweight interactive 3D architectural model. The homeowner can then annotate the model with important Points of Interest (POIs), allowing emergency personnel to quickly locate critical infrastructure and hazards before entering the building.

During an emergency, operators can rapidly search for a property, create a live situation, add incident-specific information, and share the situation with first responders through a dedicated responder interface.

The focus of SafeHome is clarity, speed, and usability—not photorealistic reconstruction.

---

# Goals

- Generate a lightweight interactive 3D architectural model from a floor plan.
- Allow homeowners to annotate important permanent infrastructure.
- Allow emergency operators to create and manage active emergency situations.
- Allow first responders to immediately access the latest property information.
- Keep the workflow simple and efficient with minimal user interaction.

---

# Users

SafeHome has three user roles.

## Homeowner

Homeowners are responsible for managing their own properties.

They can:

- Create and manage properties
- Upload a floor plan image
- View the generated 3D model
- Place and manage homeowner POIs
- Update their property information

Homeowner POIs represent permanent features of the home, including:

- Electrical Panel
- Gas Valve
- Gas Cylinder

The homeowner is responsible for keeping their floor plan up to date.

---

## Emergency Operator

Emergency operators manage active emergencies.

Operators can:

- Search for properties using a single search field
- Search by owner name
- Search by address
- Select a property from live search suggestions
- Create a new Situation for the selected property
- View the generated 3D model
- View the original uploaded floor plan
- Place incident-specific POIs
- Share the Situation with first responders

Operator POIs represent temporary information relevant to the current emergency, including:

- Fire Origin
- Trapped Victim

Operators work within active Situations rather than editing the property itself.

---

## First Responder

First responders consume information only.

They can:

- View all active Situations
- Open a Situation
- View the interactive 3D model
- View all homeowner and operator POIs
- Navigate the model

First responders have read-only access.

---

# Properties

A Property represents a physical home.

Each property contains:

- Property information
- Address
- Owner
- One uploaded floor plan
- One generated architectural model
- Homeowner POIs

Each property always contains a single floor plan.

If a homeowner uploads a new floor plan, it replaces the previous one.

---

# Floor Plans

The uploaded floor plan is the source of truth for the property's layout.

The expected format is a simple architectural floor plan image containing:

- White background
- Black walls
- Door openings
- Room labels

The system is designed around clean residential floor plans rather than scanned blueprints or construction drawings.

---

# 3D Model Generation

The generated model is a lightweight architectural representation of the floor plan.

The floor plan becomes the floor surface.

Walls are procedurally extruded vertically to create the building geometry.

Door openings remain open.

The model intentionally does not include:

- Roofs
- Furniture
- Decorative objects
- Photorealistic rendering

The objective is to provide a simple, recognizable representation of the home's structure.

---

# Points of Interest (POIs)

POIs provide contextual information about the property.

Each POI contains:

- Type
- Label
- Position within the 3D model

POIs are created by either:

- Homeowner
- Emergency Operator

Homeowner POIs represent permanent infrastructure.

Operator POIs represent temporary emergency information.

Both are displayed together inside the viewer.

---

# Situations

A Situation represents an active emergency associated with a property.

An operator creates a Situation after locating the correct property.

A Situation contains:

- Creation timestamp
- Property reference
- Current status

Once created, the operator can immediately begin annotating the property with incident-specific POIs.

First responders access the property through the active Situation.

---

# Search

Emergency operators use a single global search field.

The search supports queries such as:

- Owner name
- Property address

Results appear in real time.

Selecting a property allows the operator to immediately create a new Situation.

---

# Viewer

The viewer is the primary interface for interacting with a property.

It displays:

- Interactive 3D architectural model
- Homeowner POIs
- Operator POIs

The operator interface additionally displays:

- Original uploaded floor plan
- Situation controls
- POI placement tools

The responder interface is read-only.

---

# Design Principles

SafeHome prioritizes:

- Simplicity
- Performance
- Clarity
- Lightweight rendering
- Fast interaction
- Maintainability

The platform intentionally avoids unnecessary complexity and focuses on delivering only the information required during an emergency.
