# bordershop-bot

A tool for scraping categories found on bordershop.com webpage and save all items to a database. Then output new entires and/or updates to a Telegram channel.

The following environmental variables need to be set in order to connect to the DB before running (tested on PostgreSQL 11.9):

Database definition:

```
BS_HOST="192.168.0.1"
BS_PORT="5432"
BS_USER="username"
BS_PASSWORD="password"
BS_DBNAME="dbname"
```

Telegram APIkey and channel definition:
```
BS_APIKEY="key"
BS_CHANNEL="channel"
```

Database schema can be found in the root folder: db.psql

## Running

```
go run bordershop.go
```

### DEBUG mode
```
go run bodershop.go -debug true
```