# Verification notes

## Local API and database checks

`npm test` uses Node's test runner, Supertest, and isolated MongoDB 8.2.6. The 14 scenarios cover:

1. Generated ID, initial status/history, and seven-day follow-up.
2. Case-insensitive active duplicates and simultaneous duplicate submissions.
3. Increasing independent company counters and shared-prefix collisions.
4. Future/impossible dates, salary/type validation, and protected client fields.
5. Backend company/status queries, literal regex input, and zero-count statuses.
6. Overdue date calculation, month changes, and leap-day arithmetic.
7. Every permitted workflow branch and locked final states.
8. Skipped/repeated/reverse transitions and forged timestamps.
9. Deletion restrictions in Interview/Offer and permitted final/Applied deletion.
10. Editable fields versus immutable date/ID/history/status.
11. Duplicate prevention during edits and reapplication after finalization.
12. Overdue removal outside Applied and non-overdue behaviour on the follow-up date itself.
13. Concurrent status changes with a valid, complete history.
14. Malformed/missing IDs, malformed JSON, and exhausted three-digit counters.

The generated `evidence/api.json` records the successful named scenarios and timestamp. A failed run does not mark itself complete.

## Browser checks

`npm run build` then `npm run test:ui` serves the real production client through Express with an isolated test database. It verifies persisted creation/editing, immutable date controls, backend filters/search, overdue cues, allowed next statuses, recorded history, disabled deletion, final-state locking, confirmation cancellation/approval, future-date feedback, visible duplicate 409 errors, pagination, empty results, error/retry, and mobile layouts. It captures six real client screenshots and runs selected axe WCAG checks.

No uncaught browser errors were observed in the successful run. Automated accessibility checks do not replace keyboard/screen-reader evaluation across all browsers. The simulated error/retry test intercepts a local API response and does not claim a real service outage.

## Atlas verification — passed

The normal application requires an actual `mongodb+srv` URI. It has no in-memory or browser-storage fallback. Isolated tests do not prove Atlas connectivity.

`npm run verify:atlas` provides a separate test against the configured `mernfinal_exam` database. It exercises the frontend through the backend and checks Atlas persistence, including a visible duplicate conflict and a full workflow. Only its own uniquely named fixture is removed afterward. The actual run passed all five scenarios and saved [the result](evidence/atlas.json). The tested Atlas account is the intentionally shared exam account; it must remain restricted to the exam database.

The Atlas scenarios verified frontend-created storage, prefilled editing with immutable identity/date, a case-insensitive active duplicate displayed on the form, Interview/Offer history with forbidden deletion, and final-stage deletion from the frontend. Test records were cleaned up. The normal application uses the same Express app and Mongoose models as this verification.

Fresh evaluator machines still need network access permitted by the Atlas project. The standard app startup waits for Atlas connection and index preparation before accepting requests.

## Issues addressed while building

- Decorative artwork could intercept a navigation click; decorative elements now ignore pointer events.
- Low-contrast secondary copy/badges were darkened and rescanned on desktop/mobile screens.
- Search input follows only the applied company query, so an unrelated filter does not overwrite draft text.
- Optional native dependency entries are retained in the lockfile for Windows and Linux installs.

## Environment and scope

The application is for one job seeker's journal, as specified. Authentication, file uploads, email reminders, and external job scraping are not part of the requested assessment. There is no claim of a measured plagiarism percentage or production-load performance. The environment file is public solely because the exam requires test credentials; production credentials must not be substituted.
