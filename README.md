# bordershop-bot
![bordershop-logo](https://www.bordershop.com/client/dist/gfx/svg/logo_Puttgarden.svg)

A tool for scraping categories found on bordershop.com webpage and save all items to a database. Then output new entires and/or updates to a Telegram channel.

Version 2.0 of bordershop-bot is released!

The new version has the following changes/features:

```
* Removed the need for environment variables
* Automated setup for db with schema and initial population
* Telegram settings and categories are defined in a config.json
* Sqlite is now used, no external databse is needed
* Added test-telegram config mode
* Added debug for telegram
* Added debug for stdout rather than sending to telegram
* Logic rewritten
* Code cleanup
```

## Config

A config.json is required to run located in the config/ dir, the file should look like this:
```
{
    "Telegram": {
		"tgAPIkey": "xxx",
		"tgChannel": "xxx"
	},
	"categories": [x, y, z]
}
```
## DB schema

Database schema can be found in the db folder: db.schema

## Running

```
go run bordershop.go
```

### DEBUG mode
```
  -debug
        Turns on debug for telegram
  -stdout
        Turns on stdout rather than sending to telegram
  -telegram-test
        Sends a test message to configured telegram channel
```