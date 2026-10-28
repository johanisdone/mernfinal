# Design decisions

## Product and screens

NextStep is a single-seeker application journal. The overview is a wide workspace with an editorial heading, six status totals, a backend-filtered application list, and an overdue cue. Application details show the original applied date, backend-provided next statuses, and a timestamped timeline. Separate create/edit screens keep invalid mutation paths out of normal interaction. Small screens replace table rows with stacked cards.

## Calendar dates

Applied Date and Follow-up Date are stored as ISO `YYYY-MM-DD` calendar strings to avoid timezone shifts. The application uses the `Asia/Kolkata` calendar by default. The server provides its current calendar date to the frontend; both reject future Applied Dates. Follow-up is seven calendar days later. `isOverdue` is computed on every response: status is Applied and today's date is later than the follow-up date. The follow-up date itself is not yet overdue.

## Identifiers

Company names are trimmed and repeated spaces collapsed. A lowercase company key identifies the counter; a separate lowercase role key supports duplicate detection. ID prefixes take the first three alphabetic letters in the company name, in uppercase. Names must contain at least three alphabetic letters so the required three-letter prefix is well-defined.

MongoDB atomically increments the company's counter. Application IDs have a unique index. When two companies share a prefix, allocation retries the requesting company's sequence to avoid returning identical IDs. Sequences increase but may contain gaps after conflicting/failed insertions; they are not promised to be contiguous. Values beyond 999 return a clear conflict, keeping the specified three-digit format. Editing a company never changes the previously issued ID. API routes use MongoDB `_id` so editing display content cannot change resource identity.

## Duplicates and concurrency

A compound unique index on company key + role key applies only to documents with `isActive: true`. Applied, Interview, and Offer are active; Rejected, Accepted, and Declined are final. Only the server controls this flag. The index protects concurrent creation/editing in addition to a useful pre-check. Edits and status transitions include a document version in conditional updates; stale updates return 409 rather than losing history or overwriting a concurrent change. Deletes similarly include the version and permitted status.

## Request contract

Every API response is `{ success, message, data }`. Expected errors use 400 (validation/invalid transition), 404 (missing record), or 409 (active duplicate, sequence exhaustion, or concurrent change). Create returns 201; read/update/delete returns 200. Unexpected failures use a safe 500 response. Clients cannot set IDs, history, follow-up dates, active flags, or initial status. Applied Date and Application ID cannot be edited.

## Evidence and version history

Milestone commits record actual work as it is completed; commit times are not altered. Local isolated-database checks are labelled separately from MongoDB Atlas verification. Real screenshots are captured from the completed client. No similarity percentage is invented, and superficial renaming is not used to disguise copied material.
