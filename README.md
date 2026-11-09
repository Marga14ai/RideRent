<<<<<<< HEAD
# RideRent — Modern UI update

Requires Node.js 24 or newer. Extract the ZIP and open a terminal inside the RideRent folder containing package.json.

```bat
npm.cmd install
npm.cmd start
```

Open http://localhost:3000.

This version preserves the supplied database, bookings, fleet, and uploaded documents. It uses Node’s built-in SQLite.

## What changed

- Modern blue/off-white UI using #DBE2EF, #F9F7F7, #3F72AF and #112D4E; layouts adapt to phones and desktops.
- An accessible sun/moon icon switches themes and remembers the choice on that browser.
- One “Email or mobile number” login field automatically detects the identifier. No login dropdown.
- Birthday uses separate month/day/year controls, supports past dates and leap years, and rejects impossible/future birthdays and ages below the configured minimum.
- Government ID is removed from registration and from the booking prerequisite. Driver’s license remains required. Existing ID files and records are preserved.
- Three downloaded reference photos per vehicle model, with previous/next controls and clickable thumbnails. The added Honda Beat unit uses the same Beat model gallery. Photos work locally after extraction; no external hotlinks are needed.
- Photo credits and source links appear on each vehicle detail page and in PHOTO_CREDITS.md. Reference photos can show a different generation, trim or color; they are not photographs of the shop’s actual rental units.

Visitor statistics, OR/CR requirements and reminders, reports, admin database/ERD, shop settings and contact map remain available.

Set the actual shop location in Admin → Shop Settings. Existing motorcycles still need genuine OR/CR and a registration expiry date before they can be booked.

Read VALIDATION.md for checks performed and browser checks remaining.
=======
# RideRent
Car and motorcycle rental
>>>>>>> origin/main
