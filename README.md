# NextStep — Job Application Journal

A focused MERN application for recording applications, following each decision, and noticing when a follow-up is due.

**Assessment repository:** https://github.com/johanisdone/mernfinal

## Project scope

- Add an application with company, role, job type, applied date, optional salary, and notes.
- Server-generated company-specific application numbers, immutable after creation.
- Strict Applied → Interview/Rejected → Offer/Rejected → Accepted/Declined workflow.
- Server-maintained status timeline and follow-up date.
- Backend company search, status filtering, pagination, and per-status counts.
- Prefilled editing, active-duplicate prevention, and status-dependent deletion.
- Responsive dashboard, application detail, and form screens.

Implementation and verification are in progress. Atlas verification is pending a dedicated exam database connection; no production credentials are reused.

## Repository layout

```text
frontend/   React, Vite, routing, API service, responsive UI
backend/    Express API, Mongoose models, rules, controllers, validation
docs/       design notes, verification evidence, screenshots
scripts/    end-to-end browser verification
```

## Local setup

1. Install Node.js 22.12+ and run `npm install` at the repository root.
2. Configure `backend/.env` with an **exam-only** MongoDB Atlas URI pointing to `mernfinal_exam`.
3. Allow the development/evaluation machine's IP in Atlas Network Access.
4. Run `npm run dev`. Frontend: http://localhost:5174; API: http://localhost:5001.
5. `npm run build` produces the frontend bundle; `npm start` serves it through Express.

The `.env` files are tracked because the assessment explicitly requires them. Never place personal or production credentials in these files. The submitted Atlas account must be dedicated to the exam and restricted to its database.

## Design and originality

This implementation is written for the assessment requirements, with its own application flow, business-rule modules, interface, and explanatory documentation. Framework conventions and third-party dependencies retain their standard APIs; a similarity percentage cannot be guaranteed or claimed without a checker report. Official references: [React](https://react.dev/), [Express](https://expressjs.com/), [Mongoose](https://mongoosejs.com/), and [MongoDB Atlas](https://www.mongodb.com/docs/atlas/).

See [design decisions](docs/DESIGN.md) for date handling, counter allocation, duplicate indexes, and mutation rules. The final README will include API contracts, verified results, and two real working screenshots.
