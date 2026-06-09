# Pinnacle - Project Specification

## Project Overview

Pinnacle is a modern desktop data explorer designed for developers. It provides a fast, local, and private way to explore and manage databases and services.

The application focuses on connecting to various data sources, browsing their structures, and executing queries — all while keeping credentials and connections local to the user's machine.

### Core Principles

* Local-first architecture
* Privacy-focused
* No credential transmission to external servers
* Cross-platform support
* Modern and intuitive user experience
* Fast startup and low resource consumption

---

# Technology Stack

## Frontend

* React 19
* TypeScript
* Vite
* Tailwind CSS
* Zustand
* TanStack Query
* React Router

## Desktop Runtime

* Tauri v2
* Rust

## Editors

* Monaco Editor

Used for:

* SQL Editor
* Elasticsearch Query Editor

## Data Grid

* AG Grid Community

Used for:

* Query Results
* Redis Browser
* Elasticsearch Results
* Large Dataset Visualization

## Local Storage

* Tauri Store
* Tauri Stronghold

Used for:

* Application Settings
* Connection Profiles
* Encrypted Credentials

## Backend Libraries

### PostgreSQL

* sqlx

### MySQL

* sqlx

### Redis

* redis-rs

### RabbitMQ

* lapin

### Elasticsearch

* reqwest

---

# Design System

## Primary Color

#009ddc

## Supporting Colors

#61bb47
#fcb827
#f6821f
#e03a3e
#973d97

## Design Language

The interface should feel like a modern macOS application.

Characteristics:

* Clean layout
* Generous spacing
* Rounded corners (12px–16px)
* Dark mode first
* Subtle glassmorphism
* Smooth transitions
* Sidebar navigation
* Command palette (Cmd/Ctrl + K)

Design inspirations:

* TablePlus
* Raycast
* Arc Browser
* Linear

---

# Application: Data Explorer

A local database and service explorer.

## Supported Services

* PostgreSQL
* MySQL
* Redis
* RabbitMQ
* Elasticsearch
* MongoDB

---

# Data Explorer Features

## Connection Manager

Manage and organize connection profiles.

Connection fields:

* Name
* Type
* Host
* Port
* Username
* Password
* Database
* SSL Configuration

Passwords must be encrypted before storage.

---

## PostgreSQL Explorer

Features:

* Database Browser
* Schema Browser
* Table Browser
* SQL Editor
* Query Execution
* Query History
* CSV Export
* JSON Export

---

## MySQL Explorer

Features:

* Database Browser
* Table Browser
* SQL Editor
* Query Execution
* Query History
* CSV Export
* JSON Export

---

## Redis Explorer

Features:

* Key Browser
* Key Search
* Value Viewer
* Value Editor
* Delete Key
* TTL Viewer

---

## RabbitMQ Explorer

Features:

* Exchange Browser
* Queue Browser
* Message Viewer
* Message Publisher
* Queue Purge

---

## Elasticsearch Explorer

Features:

* Index Browser
* Query Editor
* JSON Response Viewer
* Mapping Viewer

---

# Navigation Structure

Top Navigation

* Data Explorer
* Settings

---

# Home Dashboard

Display:

* Recent Connections
* Favorite Connections
* Quick Connect

---

# Data Explorer Module

Display:

* Recent Connections
* Favorite Connections
* Connection Groups
* Quick Connect

Features:

* Search
* Tags
* Connection Categories

---

# Settings

## General

* Theme
* Language
* Font Size

## Security

* Credential Encryption
* Master Password
* Auto Lock

## Data

* Export Configuration
* Import Configuration

---

# Security Requirements

The application must follow a local-first security model.

Requirements:

* No telemetry by default
* No credential transmission to external servers
* Database connections are established directly from the user's machine
* Credentials are encrypted using Tauri Stronghold
* Support optional master password protection
* Sensitive information must never be exposed to frontend logs

---

# Architecture Requirements

## Frontend Responsibilities

* UI Rendering
* Routing
* State Management
* Form Handling
* Data Presentation

## Backend Responsibilities

* Database Connections
* Query Execution
* Credential Management
* Encryption and Decryption
* File Operations
* Export Operations

Business logic must remain in the Rust backend.

---

# MVP Scope (Version 1.0)

## Data Explorer

* PostgreSQL
* MySQL

## Core Features

* Connection Manager
* SQL Editor
* Query Execution
* Query Result Viewer
* CSV Export
* JSON Export

Redis, RabbitMQ, Elasticsearch, and MongoDB support will be implemented in later releases.

---

# Development Standards

* TypeScript strict mode
* ESLint
* Prettier
* Feature-based folder structure
* Reusable component architecture
* Clean Architecture in Rust backend
* Strong typing across frontend and backend
* Consistent error handling
* Unit tests for critical business logic