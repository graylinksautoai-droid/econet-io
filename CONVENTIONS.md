# EcoNet IO Backend Development Conventions

## 1. Geospatial Standards
* All coordinate logic must use **PostGIS** functions (e.g., `ST_GeomFromText`).
* Primary geographic targets: **Abuja** and **Ihiala**.

## 2. Security & Infrastructure
* **Zero-Touch Policy:** Never modify files in `/middleware/auth.js` without explicit instructions.
* **Accounting:** All merchant transactions must be formatted for eventual ingestion into the **Amazon Managed Blockchain** ledger.
* **Offline Resilience:** Use high-efficiency JSON structures to support the "Soul-Motion" compression engine.

## 3. Tech Stack
* **Language:** JavaScript/Node.js.
* **Database:** PostgreSQL/PostGIS.
* **Cloud Infrastructure:** AWS (SageMaker & Managed Blockchain).