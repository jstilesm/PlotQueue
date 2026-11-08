# Step 2 tutor guide: the queue store (`store.js`)

> **For Claude, reading this file:** you are Jess's tutor for this step, not
> the builder. Jess is writing `store.js` and `test/store.test.js` by hand to
> learn how they work. Read "How to tutor" first, then the "Progress log" at the
> bottom to see where the last session stopped. Then start (or resume) the
> lessons in order.

---

## How to tutor

**The goal is understanding, not a finished file.** Moving slowly is fine.
One or two lessons per sitting is a good pace.

### Rules

1. **Don't write `store.js` or `test/store.test.js` for Jess.** Don't edit
   those files and don't paste whole functions. Jess types the code.
   The exception: Jess explicitly says "write this one for me" about a
   specific piece. Then write only that piece, and explain each line.
2. **Use the hint ladder.** When Jess is stuck, go up one rung at a time and
   stop as soon as Jess is moving again:
   1. A question that points at the problem ("What happens if the file isn't there yet?")
   2. The concept ("This is the ENOENT case; `readFile` throws instead of returning null.")
   3. The API name and its docs (`fs.mkdir(path, { recursive: true })`)
   4. Pseudocode, in plain English steps
   5. A snippet of 3 lines or fewer
3. **Open each lesson by explaining, then asking.** Explain the lesson's
   concepts briefly, with a tiny example that is *not* plotq code. Ask Jess one
   or two of the lesson's questions before any code gets written.
4. **Review like a kind senior engineer.** When Jess shares code:
   - say what's good;
   - point out at most 2 or 3 issues, as questions where possible;
   - check it against the lesson's "Watch for" list.
5. **Run the tests with Jess** at each checkpoint: `npm test`, or
   `node --test test/store.test.js`. Let failures teach. Read the error output
   together before suggesting a fix.
6. **Ask Jess to explain it back** at the end of each lesson, in a sentence or
   two. Fill any gaps, then move on.
7. **Update the Progress log** at the bottom of this file when a lesson is
   done: the date, the lesson number, and one line on anything worth
   remembering. This is the only part of this file you may edit.
8. **Respect the project rules** (from the build brief):
   - built-in Node modules only, no npm packages;
   - plain functions, no classes;
   - comments only where something is non-obvious;
   - code must run on **Node 20**. Jess's Mac has Node 23, so avoid newer APIs
     like `Object.groupBy`, `Promise.withResolvers` and `fs.glob`.

---

## Where the project is now

Step 1 is done. These files exist:

- `package.json`: `"type": "module"`, `npm start` and `npm test` (`node --test`).
- `config.js`: exports `PORT` and `DATA_DIR`, read from environment variables.
- `app.js`: `createApp()` builds an `http` server with `GET /health`, CORS and
  safe static files from `public/`.
- `server.js`: starts the server.
- `test/app.test.js`: four `node:test` tests. **Its `before`/`after` pattern
  is a good model** for the store tests.

**What plotq is:** a print queue for a pen plotter. Users upload HPGL or SVG
files, which become *prints* in their library. Queuing a print creates a
*job*. A worker (Step 3) plots jobs one at a time. A kiosk screen and a web
page (later steps) read and control the queue through a JSON API (Step 4).

**There is no database.** The queue is folders on disk. A job changes state by
being *renamed* from one folder to another, because `rename` is atomic: it
either fully happens or doesn't happen at all.

**Step 2 has no HTTP.** `store.js` is plain functions that read and write
folders, plus tests. Steps 3 and 4 will call these functions.

---

## What Step 2 must produce

### Storage layout (under `DATA_DIR`)

```
users/<user>/prints/<print-id>/      print-id e.g. 20261029-1734-spiral
    source.hpgl (or source.svg)      the original upload
    plot.hpgl                        what gets plotted
    print.json                       { name, user, created, sourceType }
queue/
    control/pause                    file present = active job is paused
    control/hold                     file present = start no new jobs
    seq                              last sequence number used, as text
    tmp/                             staging area (see Lesson 6)
    pending/<seq6>-<job-id>/         e.g. 000007-20261029-174001-ab12
    active/<job-id>/                 at most one (the worker manages this, Step 3)
    done/  failed/  cancelled/       finished jobs, one <job-id>/ folder each
```

- **`job.json`** is in every job folder:
  `{ id, user, print, name, submitted, started, finished, exitCode, reason }`.
  - `print` is the print folder relative to `DATA_DIR`, e.g. `users/Jess/prints/20261029-1734-spiral`.
  - Timestamps are ISO strings (`new Date().toISOString()`).
  - Fields not known yet are `null`.
- **A job ID** looks like `20261029-174001-ab12`: date, time, then 4 random hex digits.
- **A job points at its print.** It does not copy `plot.hpgl`.

### The `/queue.json` shape that `readQueue()` returns

This shape is a contract with the kiosk page. Match it exactly.

```json
{
  "hold": false,
  "active": {"id": "20261029-174001-ab12", "user": "Jess", "name": "spiral.svg",
             "preview": "/prints/Jess/20261029-1734-spiral/preview.svg",
             "progress": null, "paused": false},
  "pending": [{"id": "20261029-174210-9f3c", "user": "Ana", "name": "flowfield.hpgl",
               "preview": "/prints/Ana/20261029-1741-flowfield/preview.svg"}],
  "recent":  [{"id": "20261029-170102-1d2e", "user": "Sam", "name": "grid.hpgl",
               "state": "done", "finished": "2026-10-29T17:20:00Z"}]
}
```

- `active` is `null` when nothing is plotting.
- `pending` is in plot order.
- `recent` is the last 10 finished jobs (done, failed or cancelled), newest first.
- `progress` is always `null` for now.
- `paused` is true when `control/pause` exists.

### Target interface

The tutor needs this to keep Jess's design compatible with Steps 3 and 4. Share
it with Jess as the spec, but let Jess work out the bodies.

```js
export async function createStore(dataDir)   // makes all folders, returns the object below

{
  withLock(fn),                       // runs fn after every earlier withLock call has finished
  createPrint({ user, name, sourceType, source, hpgl }),  // -> { id, name, user, created, sourceType }
  enqueue(user, printId),             // -> job object (what's in job.json)
  listPending(),                      // -> [{ seq, id, dir, job }] in plot order
  moveJob(id, to),                    // to = 'up' | 'down' | 'top'
  cancelPending(id),                  // deletes the pending job's folder
  setFlag(name), clearFlag(name),     // name = 'pause' | 'hold'
  readQueue(),                        // -> the /queue.json shape above
  pruneFinished(keep = 50),           // deletes the oldest finished jobs beyond `keep`
}
```

### Design decisions already made (explain the "why" to Jess)

- **`createStore(dataDir)` is a factory.** It takes the folder as an argument
  instead of importing `DATA_DIR`, so each test gets a fresh temporary folder.
  The functions it returns "remember" `dataDir` through a closure. `server.js`
  will call `createStore(DATA_DIR)` once.
- **Store functions do not lock themselves; callers wrap them in `withLock`.**
  Why: the lock isn't re-entrant. If `moveJob` took the lock and then called
  something else that also took it, it would wait for itself forever (a
  deadlock). Keeping the store functions lock-free means they can call each
  other freely. The HTTP routes (Step 4) and the worker (Step 3) do the
  locking, at the door.
- **Bad input throws an error with a `status`.** For example:
  `Object.assign(new Error('job not found'), { status: 404 })`. Step 4 will
  turn `err.status` into the HTTP status code. Use 404 for unknown
  jobs and prints, and 400 for bad names or a bad `to`.
- **Names must match `/^[A-Za-z0-9_-]+$/`.** That applies to `user`, a print
  ID and a job ID. Anything else throws a 400. This is what stops `..` from
  escaping `DATA_DIR`, the same idea as Step 1's `public/` check.
- **New pending jobs are built in `queue/tmp/`, then renamed into
  `pending/`.** Why: the job folder appears complete or not at all, so nothing
  can ever read a half-written job.
- **`moveJob(id, 'top')` is repeated `'up'` swaps.** It's simple, and correct
  for queues of a few dozen jobs.

### Decisions to let Jess make

Ask; don't decide. Offer the recommendation if Jess wants one.

- **Local time or UTC in IDs?** Local reads nicer for the people at the
  plotter. UTC never jumps at daylight saving time. *Recommend: UTC, to match
  the ISO timestamps.*
- **What `moveJob` does when the move is impossible**, like moving the first
  job up: throw, or quietly do nothing? *Recommend: do nothing. The kiosk
  already greys out that button, and a no-op is harmless.*
- **How to make the print-ID "slug"** from a file name like `My Spiral (2).svg`.
  *Recommend: drop the extension, replace runs of disallowed characters with
  `-`, trim the dashes, cap it at about 40 characters, and fall back to `print`.*

---

## Lessons

Each lesson has:
- **Goal:** what exists at the end.
- **Concepts:** what to teach first.
- **Ask Jess:** questions to open with.
- **Build:** what Jess writes.
- **Checkpoint:** how to prove it works.
- **Watch for:** notes for the tutor, the mistakes to catch in review.

### Lesson 0: Orientation (no code)

- **Goal:** Jess can describe the whole folder layout and a job's life from
  memory.
- **Concepts:**
  - Folders as a database: `readdir` is a query, and `rename` is a state change.
  - Why `rename` is atomic, and why that matters if the Pi loses power mid-write.
  - The difference between a *print*, which lives in the library forever, and a
    *job*, which is one request to plot a print.
  - Zero-padded sequence numbers: `000010` sorts after `000009` as text,
    but `10` sorts before `9`.
- **Ask Jess:**
  - "If the power cuts out halfway through moving a job from pending to active,
    what state can the folders be in?"
  - "Why does a job point at its print instead of copying `plot.hpgl`?"
- **Build:** Jess sketches the `DATA_DIR` tree on paper or in a scratch file,
  with one print and three jobs in different states.
- **Checkpoint:** Jess explains the sketch back.

### Lesson 1: The skeleton, and the first test

- **Goal:** `createStore(dir)` creates every folder in the layout, and one test
  proves it.
- **Concepts:**
  - `import { mkdir, ... } from 'node:fs/promises'`, and `async`/`await`.
  - `mkdir(path, { recursive: true })`: it creates parent folders, and doesn't
    fail if the folder already exists. Ask why that second part matters on
    every restart.
  - Factories and closures: a function that returns functions which remember
    a variable.
  - Test isolation:
    - make a temporary folder with `mkdtemp(path.join(os.tmpdir(), 'plotq-'))`;
    - delete it afterwards with `rm(dir, { recursive: true, force: true })`;
    - use `t.after(...)` inside a test, or `after(...)` at the top level.
    - Look at `test/app.test.js` for the pattern.
- **Ask Jess:**
  - "Why should the tests never touch the real `~/plotq-data`?"
  - "Where should the list of folder names live so it's written only once?"
- **Build:**
  - `store.js` with `createStore` returning an empty object for now.
  - A small helper for building paths under `dataDir`, so that `path.join`
    isn't repeated everywhere.
  - `test/store.test.js` with a `freshStore()` helper and a test that checks
    each folder exists (`stat` or `access`).
- **Checkpoint:** `npm test` shows the new test passing alongside the 4 from
  Step 1.
- **Watch for:**
  - forgetting `await` on `mkdir`;
  - creating folders one by one without `recursive`;
  - hard-coding `/Users/...` paths in tests.

### Lesson 2: Small helpers

- **Goal:** `readJson`, `writeJson`, `exists` and `checkName` work. They are
  private, not exported.
- **Concepts:**
  - `readFile` throws when the file is missing. Look at `err.code === 'ENOENT'`.
    Step 1's `serveStatic` in `app.js` does exactly this; have Jess find it.
  - `JSON.stringify(value, null, 2)` writes readable files. Jess will
    `cat` these files while debugging.
  - Regular expressions: `/^[A-Za-z0-9_-]+$/`. What `^` and `$` mean, and why
    leaving them out is a security bug.
  - Errors with a `status` property (see the design decisions above).
- **Ask Jess:**
  - "Should `exists()` catch *every* error, or only ENOENT? What would hiding a
    permissions error do?"
  - "Which names would pass the regex without `^` and `$`?" Try `../../etc`.
- **Build:** the four helpers. Jess can test `checkName` through the public
  functions later, or temporarily export it to try it out.
- **Checkpoint:** in a quick scratch run (`node -e` or a temporary test),
  `checkName('Jess')` passes, and `checkName('../x')` and `checkName('')`
  both throw with status 400.
- **Watch for:** `exists()` swallowing all errors; the regex missing anchors.

### Lesson 3: `withLock`, the most important idea in this step

- **Goal:** `withLock(fn)` runs calls one after another, and a test proves it.
- **Concepts:**
  - JavaScript is single-threaded, but **async functions interleave at every
    `await`**. Walk through two `enqueue` calls racing. Both read `seq` as 4,
    both write 5, and now there are two jobs with the same sequence number.
  - A promise chain as a queue. Keep one `last` promise. Each call runs `fn`
    after `last`, then becomes the new `last`.
  - **Why the chain needs a `.catch`:** if one `fn` fails, the next callers
    must still run. The *caller* still gets the error; only the chain ignores
    it.
  - Deadlock: why the store functions don't take the lock themselves (see the
    design decisions above).
- **Ask Jess:**
  - "Draw a timeline of two `enqueue` calls without the lock. Where exactly do
    they collide?"
  - "If `fn` throws, what should (a) the caller and (b) the next queued call see?"
- **Build:** `withLock` inside `createStore`.
- **Checkpoint:** a test that starts 3 locked calls at once with
  `Promise.all`. Each call awaits a short `setTimeout` and pushes to an array.
  The test asserts the order is 1, 2, 3. A second test checks that a thrown
  error rejects for its caller but doesn't block the next call.
  Optional but memorable: write the race *without* the lock first, and watch it
  fail.
- **Watch for:**
  - the chain broken by a rejected promise, because the `.catch` is missing;
  - returning the *caught* promise to the caller, which hides their error;
  - calling `fn` immediately instead of inside `.then`.

### Lesson 4: IDs and sequence numbers

- **Goal:** `makeJobId()` and `nextSeq()` work.
- **Concepts:**
  - Building `YYYYMMDD-HHMMSS` from a `Date`, with `String(n).padStart(2, '0')`.
    Jess decides local time or UTC here.
  - `randomBytes(2).toString('hex')` from `node:crypto` gives 4 hex digits.
    Ask Jess what the odds are of two jobs in the same second colliding.
  - `nextSeq()`:
    - read `queue/seq` (missing means 0);
    - add 1;
    - write it back;
    - return the number.
  - The pending folder name: `String(seq).padStart(6, '0') + '-' + id`.
- **Ask Jess:**
  - "Why store the last sequence number in a file, instead of counting the
    pending folders?" Hint: think about what happens after a job finishes.
  - "Why must `nextSeq` only ever be called inside `withLock`?"
- **Build:** both helpers, private.
- **Checkpoint:** a test (through `enqueue` later, or a temporary export)
  showing three calls give 1, 2, 3, and that the count survives a new
  `createStore` on the same folder.
- **Watch for:** `Number()` on a file that ends in a newline (it's fine, but ask
  why); padding on the wrong side.

### Lesson 5: `createPrint`

- **Goal:** a print folder with `source.<type>`, `plot.hpgl` and `print.json`.
- **Concepts:**
  - The print-ID format `YYYYMMDD-HHMM-<slug>`. Jess designs the slug function.
  - **Collisions:** two uploads of `spiral.svg` in the same minute. Use
    `mkdir` *without* `recursive`: it throws `EEXIST` if the folder exists.
    Then try `-2`, `-3`, and so on. That's both the check and the claim in one
    step, so two uploads can't both get the same ID.
  - Step 2 does no SVG conversion. For HPGL uploads, `source` and `hpgl` are
    the same text.
- **Ask Jess:**
  - "Why is 'check if it exists, then create it' worse than 'try to create
    it, and handle EEXIST'?"
  - "What should `print.json`'s `name` be: the original file name or the slug?"
- **Build:** `createPrint`. Call `checkName(user)` first. The user's
  `prints/` folder may not exist yet.
- **Checkpoint:** tests that check:
  - the three files exist and `print.json` has the right fields;
  - two prints with the same name get different IDs;
  - a user like `../evil` throws 400.
- **Watch for:**
  - `recursive: true` on the final `mkdir`, which silently defeats the
    collision check;
  - the slug allowing `.`.

### Lesson 6: `enqueue` and `listPending`

- **Goal:** queuing prints creates pending jobs, and `listPending` returns them
  in order.
- **Concepts:**
  - Build the job folder in `queue/tmp/<job-id>`, write `job.json`, then
    `rename` it to `pending/<seq6>-<job-id>`.
  - `listPending`:
    - `readdir` the `pending` folder;
    - sort (zero-padding makes text order match number order);
    - split each name into `seq` and `id` (the first 6 characters, then the
      rest after the `-`);
    - read each `job.json`.
  - Ask Jess: does `readdir` return names in a guaranteed order? (It doesn't.)
- **Ask Jess:** "What would the worker see if it read `pending/` while
  `enqueue` was halfway through writing `job.json`, without the tmp folder?"
- **Build:** both functions. `enqueue` throws 404 if the print doesn't exist,
  and reads the job name from `print.json`.
- **Checkpoint:** a test that queues three prints (wrapped in `withLock`,
  or plain sequential `await`s) and checks that `listPending()` IDs match the
  order queued, and that `job.json` has every field with `started: null` and
  so on.
- **Watch for:**
  - forgetting to sort;
  - `parseInt` of the seq without thinking about the leading zeros
    (`Number('000007')` is fine, but ask);
  - a `print` path that's absolute instead of relative to `DATA_DIR`.

### Lesson 7: `moveJob`

- **Goal:** up, down and top reorder pending jobs.
- **Concepts:**
  - A swap trades two folders' sequence numbers. It takes three renames
    through a temporary name, A to tmp, B to A's name, tmp to B's name, just
    like swapping two variables. Ask Jess why two renames aren't enough.
  - What `rename` does when the target folder already exists and isn't empty.
    Let Jess try it in a scratch folder; the answer is it fails with ENOTEMPTY.
  - `'top'` is a loop of `'up'` swaps. This works because store functions
    don't take the lock (Lesson 3).
  - Errors: unknown job means 404; a bad `to` means 400. Jess decides what an
    impossible move does.
- **Ask Jess:** "After a swap, which part of each folder name changed, and
  which stayed?"
- **Build:** `moveJob`, plus a small private `findPending(id)` that both
  `moveJob` and `cancelPending` can use.
- **Checkpoint:** with jobs [A, B, C], these tests pass:
  - moving C up gives [A, C, B];
  - moving A down gives [B, A, C];
  - moving C to the top gives [C, A, B];
  - moving A up does whatever Jess chose;
  - an unknown ID throws 404.
- **Watch for:**
  - using the *new* index after the first rename;
  - leaving the temp folder behind on an error;
  - sorting by job ID instead of by seq.

### Lesson 8: `cancelPending`, `setFlag` and `clearFlag`

- **Goal:** pending jobs can be removed, and the pause and hold flags work.
- **Concepts:**
  - `rm(dir, { recursive: true })` to delete the job folder.
  - Flags as empty files: `writeFile(path, '')` to set one;
    `rm(path, { force: true })` to clear one. Ask why `force` makes clearing
    *idempotent* (safe to repeat).
  - Allow only `'pause'` and `'hold'`; anything else throws 400.
- **Ask Jess:** "Why is a file's *existence* a good way to store a yes/no
  setting here?"
- **Build:** the three functions.
- **Checkpoint:** tests that check:
  - a cancelled job disappears from `listPending`;
  - cancelling an unknown ID throws 404;
  - `setFlag('hold')` then `clearFlag('hold')`, twice, never throws;
  - `setFlag('../x')` throws 400.
- **Watch for:** `rm` without `recursive` on a folder; the flag name used in
  a path before it's validated.

### Lesson 9: `readQueue`, the contract

- **Goal:** `readQueue()` returns exactly the `/queue.json` shape.
- **Concepts:**
  - Build each part separately:
    - `hold`: does the hold flag file exist?
    - `active`: the one folder in `active/`, or `null`;
    - `pending`: from `listPending`;
    - `recent`: read `done`, `failed` and `cancelled`, add `state` (the folder
      name), sort by `finished` (newest first), and keep 10.
  - Deriving `preview` from `job.print`:
    `users/Jess/prints/X` becomes `/prints/Jess/X/preview.svg`. The file
    doesn't exist until Step 7; the path is still correct now.
  - **Return only the fields in the contract.** Don't spread the whole
    `job.json` in; the kiosk shouldn't depend on extra fields.
  - Testing a shape with `assert.deepEqual`. For the active and finished jobs,
    the test can write `job.json` folders directly into `active/` or `done/`,
    since the worker doesn't exist yet.
  - ISO timestamps sort correctly as plain text. Ask Jess why.
- **Ask Jess:** "Why is it risky to return extra fields the kiosk doesn't use?"
- **Build:** `readQueue`.
- **Checkpoint:** tests that check:
  - an empty queue equals
    `{ hold: false, active: null, pending: [], recent: [] }`;
  - a full one has an active job, 2 pending, 12 finished across the three
    folders, and hold set. It returns the exact shape, `recent` has 10 entries
    newest first, and `paused` follows the pause flag.
- **Watch for:**
  - `recent` sorted oldest-first;
  - a missing `state`;
  - `preview` built with the `users/` prefix still on it;
  - `progress` missing instead of `null`.

### Lesson 10: `pruneFinished`

- **Goal:** only the newest `keep` finished jobs remain.
- **Concepts:** it reuses Lesson 9's "collect all finished jobs" code, so
  refactor it into a shared private helper. That's a good moment to talk about
  when to extract a function.
- **Ask Jess:** "Prune runs every time a job finishes. Is reading 50 small JSON
  files each time a problem on a Pi? How would you know?"
- **Build:** `pruneFinished(keep = 50)`, returning how many it removed.
- **Checkpoint:** a test that makes 55 finished jobs with known `finished`
  times, prunes, and checks that the 50 newest remain.
- **Watch for:** pruning by folder name instead of the `finished` time;
  touching `pending/` or `active/`.

### Lesson 11: Wrap-up

- **Goal:** Jess owns the whole file.
- **Steps:**
  1. Run `npm test` and confirm everything passes.
  2. Read `store.js` top to bottom together. Is every comment still true? Is
     anything clever that could be plain? Are there unused helpers?
  3. Jess explains, without looking:
     - the folder layout;
     - why `withLock` exists and why callers hold it;
     - why `rename` is atomic, and where the code relies on that.
  4. Preview Step 3: the worker will call `listPending()`, `rename` the first
     job into `active/`, spawn the plot command, and later rename the job to
     `done/` or `failed/`. All of that happens inside `withLock`. Ask Jess
     which functions from this step it will need.
  5. Jess commits. Suggested message: `Add folder-based queue store with tests (step 2)`.

---

## Progress log

Tutor: add one line per completed lesson. Newest last.

- 2026-11-05, Lesson 0: done. Needed a filled-in tree to get started with the sketch. First called the move a "control operation"; corrected to `rename` (control files are signals, not moves). Jess raised future input modes (canvas → sourceType "canvas" with re-editable source.json; live drawing is a separate later feature that uses hold and saves into the library, not the queue).
- 2026-11-05, Lesson 1: done. Jess wrote store.js (FOLDERS, closure `p`, for...of mkdir loop) after fixing `in` vs `of` (saw folders named 0–7) and options passed to `p` instead of `mkdir`. Jess asked the tutor to write test/store.test.js; imports were the sticking point (`node:fs` vs `/promises`, default vs named imports, `.js` extension). Explain-back on test isolation needed correcting; revisit it when Lesson 6 tests share state.
- 2026-11-05, Lesson 2: done. Jess wrote all four helpers over several review rounds. Recurring slips: `node:fs` vs `node:fs/promises`, missing `await`, `return err` instead of rethrowing, `return stat(file)` without await (catch never runs). Checkpoint found that `checkName(undefined)` passed (regex coerces to "undefined"); Jess added a `typeof` check. First instinct on exists() was that permission errors should read as "missing"; reinforce "couldn't check ≠ not there" in Lesson 8 (flags). Tip: Jess sometimes forgets to save before asking for review.
- 2026-11-06, Lesson 3: done. Jess wrote withLock (went through: new Promise wrapper with misplaced .catch → caught promise returned to caller → correct 3 lines; found the missing `last =` update herself). Jess wrote both tests (needed a 1-call snippet for Promise.all). Tutor ran both tests against two broken copies in scratch: no-update gave [3,2,1], no-catch made `good` reject with boom. Explain-back mixed up "shared last" (ordering) with "two promises" (caller gets error, chain doesn't), and thought the deadlock was an ordering problem. Revisit deadlock concretely in Lesson 7 ('top' calling 'up').
- 2026-11-06, Lesson 4: done. Jess chose **UTC** for IDs. makeJobId went through: number.padStart, missing (), local getters, getTime() (ms since epoch); final version uses a `pad` helper with getUTC* (checked against `date -u`). nextSeq needed a breakdown of "missing file → 0" (chose the exists() route); first drafts lacked awaits (`if (exists(file))` always truthy) and returned 0 without writing. Verified 1,2,3 then 4 after a new createStore. Counting-folders question: Jess said 000004 (the file's answer), not the duplicate 3. Explain-back said lock is about "ordering"; corrected to duplicate numbers from read/write interleaving. Tutor's `new Error` style tip led Jess to drop `throw` in a test; the test caught it.
- 2026-11-07, Lesson 5: done. **Decisions:** HPGL-only uploads for now (createPrint throws 400 unless sourceType === 'hpgl'; SVG and canvas deferred); slug rules as recommended (tutor wrote `slugify`, since Jess asked to skip regex and focus on backend ideas). There's also a separate existing websocket program that drives the plotter; coordinate it with the worker in Step 3. Jess wrote createPrint; she extracted a shared `utcStamp()` (her idea) used by makeJobId and the print ID. Bugs on the way: loop without `break` (would make folders forever, so it wasn't run), relative paths (`prints/${id}`, `'source.hpgl'`) instead of `p(...)`, writeJson nested in writeFile. Jess's own extra test cases found that createPrint didn't validate source/hpgl (a TypeError after mkdir left a folder without print.json); added a "validate before touching disk" check, including empty strings. Test slips: missing await (A.id === B.id === undefined), then `await` inside assert.rejects. Tutor wrote test 1 at Jess's request. 10/10 pass. Note: `print.json` written last acts as a commit marker; Lesson 6's enqueue and the later library listing should treat a missing print.json as "not a print". Watch: Jess's editor twice saved an old buffer over tutor edits.
