# bordershop-bot

A tool for scraping categories found on bordershop.com webpage and save all items to a database. Then output new entires and/or updates to a Telegram channel.

The following environmental variables need to be set in order to connect to the DB before running:

Database definition:

BS_HOST="192.168.0.1"

BS_USER="username"

BS_PASSWORD="password"

BS_DBNAME="dbname"

Telegram definition:

BS_APIKEY="key"

BS_CHANNEL="channel"
