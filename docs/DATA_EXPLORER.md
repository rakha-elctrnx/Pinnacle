# Pinnacle Data Explorer - Detailed Feature & UI Specification

## Overview

Data Explorer is a local-first database and infrastructure management module that allows developers to connect directly to remote services without sending credentials through any third-party server.

The experience should feel like a combination of:

* TablePlus
* Navicat
* DBeaver
* RedisInsight
* RabbitMQ Management UI
* Kibana Dev Tools

All connections are executed locally through the Tauri backend.

---

# Main Layout

The Data Explorer module uses a three-panel layout.

```text
┌────────────────────────────────────────────────────────────┐
│ Top Toolbar                                                │
├──────────┬───────────────────────┬─────────────────────────┤
│ Sidebar  │ Explorer Panel        │ Details Panel           │
│          │                       │                         │
│          │                       │                         │
└──────────┴───────────────────────┴─────────────────────────┘
```

---

# Top Toolbar

Located at the top of the application.

Contains:

### Global Search

Allows searching:

* Connections
* Databases
* Tables
* Collections
* Keys
* Queues
* Indexes

Shortcut:

```text
Cmd + K
Ctrl + K
```

---

### Quick Connect Button

Opens connection dialog.

Supported types:

* PostgreSQL
* MySQL
* Redis
* RabbitMQ
* Elasticsearch

---

### Recent Connections

Dropdown showing recently opened connections.

---

### Refresh Button

Refresh current explorer tree.

---

### Connection Status Indicator

Displays:

* Connected
* Connecting
* Disconnected
* Error

---

# Left Sidebar

Contains all saved connections.

Example:

```text
Connections
├─ Production
│   ├─ PostgreSQL
│   └─ Redis
│
├─ Staging
│   ├─ PostgreSQL
│   └─ RabbitMQ
│
└─ Local
    ├─ MySQL
    └─ Elasticsearch
```

Features:

* Favorite connection
* Group connection
* Rename
* Duplicate
* Export configuration
* Delete

---

# Connection Manager

## Connection Card

Each connection displays:

```text
[ PostgreSQL ]

Production DB

db.company.com
Connected
```

Optional tags:

```text
Production
Staging
Development
```

Color indicators:

Green:
Connected

Yellow:
Idle

Red:
Disconnected

---

# Connection Creation Wizard

Step 1

Select type:

```text
○ PostgreSQL
○ MySQL
○ Redis
○ RabbitMQ
○ Elasticsearch
```

Step 2

Connection information:

```text
Name
Host
Port
Username
Password
Database
SSL
```

Step 3

Test connection

Button:

```text
[Test Connection]
```

Result:

```text
✓ Connected Successfully
```

or

```text
✗ Authentication Failed
```

Step 4

Save connection

---

# PostgreSQL Explorer

## Explorer Tree

```text
Production DB

Databases
└─ app_db

Schemas
├─ public
├─ auth
└─ reporting

Tables
├─ users
├─ orders
├─ products
└─ invoices

Views
Functions
Triggers
Indexes
```

---

## Table Browser

When selecting a table:

```text
users
```

Display:

### Table Summary

```text
Rows
Columns
Size
Indexes
```

---

### Data Tab

Spreadsheet-like viewer.

```text
┌────┬───────┬─────────────┐
│ id │ name  │ email       │
├────┼───────┼─────────────┤
│ 1  │ John  │ xxx@email   │
└────┴───────┴─────────────┘
```

Features:

* Pagination
* Infinite scroll
* Column filter
* Sorting
* Copy cell
* Export rows

---

### Structure Tab

Display:

```sql
id bigint
name varchar
email varchar
created_at timestamp
```

Also shows:

* Primary key
* Foreign key
* Constraints
* Default values

---

### Indexes Tab

Display:

```text
users_pkey
idx_users_email
```

---

### Relationships Tab

Visual relationship graph.

```text
users ───── orders
  │
  └──── invoices
```

---

# SQL Editor

Central feature of PostgreSQL and MySQL.

Uses Monaco Editor.

Features:

### Syntax Highlighting

SQL keywords.

---

### Auto Completion

Suggest:

* Tables
* Columns
* Keywords
* Functions

---

### Query Execution

Buttons:

```text
Run
Run Selected
Explain
```

Shortcuts:

```text
Cmd + Enter
Ctrl + Enter
```

---

### Multiple Tabs

```text
Query 1
Query 2
Query 3
```

---

### Query History

Stores previous executions.

Example:

```sql
SELECT * FROM users;
```

```sql
SELECT * FROM orders;
```

---

### Explain Plan Viewer

Display query execution plan.

Tree view:

```text
Seq Scan
└─ Filter
```

---

# Query Results

Appears below SQL editor.

Tabs:

### Results

Grid view.

### Messages

Execution logs.

### Statistics

```text
Rows Returned
Execution Time
Data Size
```

---

# MySQL Explorer

Almost identical to PostgreSQL.

Additional features:

### Stored Procedures

```text
sp_generate_report
sp_create_invoice
```

---

### Events

```text
daily_cleanup
```

---

# Redis Explorer

Optimized for Redis data structures.

## Explorer Tree

```text
Redis

Strings
Hashes
Lists
Sets
Sorted Sets
Streams
```

---

## Key Browser

Search bar:

```text
session:*
```

Supports:

* Wildcard search
* Prefix search

---

## Value Viewer

String:

```text
token_12345
```

Hash:

```json
{
  "name": "John",
  "email": "john@email.com"
}
```

List:

```json
[
  "item1",
  "item2"
]
```

---

## TTL Viewer

Display:

```text
Expires in 2h 14m
```

---

## Key Actions

* Edit
* Delete
* Copy
* Export

---

# RabbitMQ Explorer

## Explorer Tree

```text
RabbitMQ

Connections
Channels
Exchanges
Queues
Consumers
```

---

## Queue Viewer

Displays:

```text
Queue Name
Messages Ready
Consumers
```

---

## Message Browser

View queued messages.

```json
{
  "orderId": 123
}
```

---

## Publish Message

Form:

```json
{
  "event": "user.created"
}
```

Button:

```text
Publish
```

---

## Queue Actions

* Purge Queue
* Delete Queue
* Create Queue

---

# Elasticsearch Explorer

## Explorer Tree

```text
Elasticsearch

Indexes
Templates
Aliases
```

---

## Index Browser

Display:

```text
products
users
logs
```

---

## Query Editor

Monaco editor with JSON support.

Example:

```json
{
  "query": {
    "match_all": {}
  }
}
```

---

## Search Results

Table View

```text
id
name
price
```

JSON View

```json
{
  "hits": {}
}
```

---

## Mapping Viewer

Display field mappings.

```json
{
  "name": "keyword",
  "price": "float"
}
```

---

# Right Details Panel

Contextual information panel.

Shows:

### Connection Details

* Host
* Port
* Version
* SSL Status

### Database Statistics

* Table Count
* Storage Size
* Active Connections

### Redis Statistics

* Memory Usage
* Connected Clients
* Key Count

### RabbitMQ Statistics

* Queue Count
* Message Count

### Elasticsearch Statistics

* Index Count
* Document Count

---

# Productivity Features

## Favorites

Favorite:

* Tables
* Queries
* Connections
* Queues
* Indexes

---

## Snippets

Saved SQL snippets.

Example:

```sql
SELECT *
FROM users
LIMIT 100;
```

---

## Query Templates

Common templates:

* Select
* Insert
* Update
* Delete
* Create Table

---

## Export

Supported formats:

* CSV
* JSON
* SQL
* XLSX

---

## Command Palette

Shortcut:

```text
Cmd + K
Ctrl + K
```

Examples:

```text
Open Connection
Run Query
Create Table
Refresh Schema
Export Data
```

---

# Future Features (Post-MVP)

* MongoDB Explorer
* ClickHouse Explorer
* Kafka Explorer
* SSH Tunnel
* ER Diagram Generator
* AI SQL Assistant
* Query Performance Analyzer
* Team Workspace
* Database Diff Tool
* Database Migration Tool
* Visual Query Builder
* Data Import Wizard
* Saved Dashboards
