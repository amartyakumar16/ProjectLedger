# ProjectLedger

A project operations dashboard for managing projects, budgets, expenses, teams and approvals in one workspace. Built with React 18, JavaScript and Vite.

## Features

- **Project management:** portfolio dashboard, project workspaces, tasks, milestones, timelines and daily updates.
- **Budgets and expenses:** allocations, commitments, expense approvals, ledger entries, reversals and financial reports. Money is calculated in integer paise and displayed in INR.
- **Workforce:** people, assignments, attendance, timesheets, effective-dated rates and payroll cost allocation.
- **Worker daily progress:** track daily quantities, cumulative completion and remaining work; export sheets to Excel.
- **Funding requests:** itemised requests, approval routing, notifications and allocation history.
- **PDF to Excel:** extract editable tables from PDFs and images, recognise scanned text with OCR and download real `.xlsx` workbooks.
- **Data checks:** send selected document rows to a project manager for review. Completed checks move to a dedicated **Closed Requests** page with search by document, person, date, notes or saved values.
- **Role-based views:** owner, finance, project manager, employee, funding approver, HR and auditor.
- **Consistent interface:** forest-green and sage styling, a compact login page, responsive layouts and subtle motion with reduced-motion support.

## Requirements

- Node.js **22.13 or newer**
- npm
- A modern browser

## Run locally

```bash
git clone https://github.com/amartyakumar16/ProjectLedger.git
cd ProjectLedger
npm ci
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The development server may choose another port if 5173 is already in use.

No environment variables, database or backend server are required for this demo.

## Sign in

Open the login page and click **Choose a demo account**, select a user, then click **Sign in to workspace**. You can also type the account's email address.

| Account | Role | Email |
| --- | --- | --- |
| Aakash Kumar | Owner | `aakash@phoenixengineers.example` |
| Priya Sharma | Finance | `priya@phoenixengineers.example` |
| Rohan Mehta | Project manager | `rohan@phoenixengineers.example` |
| Neha Gupta | Project manager | `neha@phoenixengineers.example` |
| Vikram Singh | Employee | `vikram@phoenixengineers.example` |
| Anita Desai | Funding approver | `anita@phoenixengineers.example` |
| Sanjay Rao | HR / payroll | `sanjay@phoenixengineers.example` |
| Kavita Iyer | Auditor | `kavita@phoenixengineers.example` |

These are demo accounts; no password is required. Use **Switch user** to sign out and choose another account. Visit `/login` to preview the login page while signed in.

## Data storage

The application stores records in the current browser's **localStorage**. Records persist across reloads in that browser and origin; they are not shared between devices or browsers.

The app starts without business records while retaining demo accounts and organization settings. **Administration > App data** provides JSON export, a recovery-copy download and a way to clear records. The one-time October 2026 cleanup migration preserves a recovery copy of pre-existing browser records. Automated tests use generated sample data.

## PDF extraction and review

1. Open **PDF to Excel** and choose a PDF, PNG, JPG or WebP file, up to 100 MB.
2. Select the extraction and text-recognition modes, then read the document.
3. Review and edit extracted values before exporting to Excel.
4. Select extracted rows and use **Request data check** to send them to a project manager.
5. Review requests under **Active Requests**. Marking a request checked moves it to **Closed Requests**, where its saved rows, review notes and completion details remain available.

Extraction runs in the browser. OCR initialization downloads English recognition files and needs internet; PDF.js may also download fonts and character maps. Encrypted PDFs must be unlocked first. Layout recognition is pattern-based: unfamiliar layouts and scanned numbers need manual review. Unsaved extraction results stay in memory while the conversion screen is open; download the workbook to keep them.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the Vitest test suite |
| `npm run build` | Generate a production build in `dist/` |
| `npm run preview` | Serve the production build locally |

For a local production preview:

```bash
npm run build
npm run preview
```

The test suite covers financial calculations and approval rules, PDF extraction and Excel export, data-check workflows, closed-request search, worker progress and browser-storage recovery.

## Project structure

```text
src/
  components/    Shared layout, brand mark, data-check lists and UI elements
  data/          Demo account setup and sample data generator
  lib/           Finance, permissions, money, PDF/OCR and quantity helpers
  pages/         Login, dashboard, project workspaces and application screens
  store/         Domain actions, React state and localStorage persistence
  App.jsx        Application routing
  styles.css     Shared theme, responsive layout and UI motion
docs/            Existing guides, examples and supporting documentation
```

## Deployment and production use

Deploy the generated `dist/` directory to a static host. Configure a fallback to `index.html` so direct links such as `/login`, `/projects` and `/closed-requests` work with React Router.

This is a front-end demo. The email field selects a local demo account and does not authenticate a user's identity. Role-based UI and client-side action checks are not server-side security. Production use requires a backend, authenticated sessions or SSO, server-side authorization, a shared database, protected document storage and a real email delivery service. Funding emails and notifications currently use local application workflows.
