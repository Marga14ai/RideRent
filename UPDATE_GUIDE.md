# Updated setup guide

See README.md for the current setup and behavior. It supersedes earlier setup instructions.

Use Node.js 24 or newer. Run npm.cmd install, then npm.cmd start inside RideRent.

Email/mobile login now uses one text field with automatic detection. Birthday uses month/day/year controls. Only the driver’s license is requested during registration; government ID is no longer required for registration or booking.

Configure actual shop details and the map pin through Admin → Shop Settings. Motorcycle registration is managed through Admin → OR/CR & Renewals. The server checks reminders at startup, hourly, and after registration updates. Stopped servers process reminders when next started. Reminders are in-app.

Contact-map tiles and route estimates need internet and location permission. GPS requires HTTPS or localhost. Downloaded vehicle photos work without internet.

Before replacing an older installation, stop the old server and back up the folder. Keep SQLite and any WAL files together when copying a live database. The ZIP contains the database supplied in RideRent2.zip with the schema upgrade applied; it cannot contain changes made separately on your computer after uploading.
