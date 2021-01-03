package main

import (
	"database/sql"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/wbergg/bordershop-bot/message"
	"github.com/wbergg/bordershop-bot/terminal"

	"github.com/coral/bordershop"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/r3labs/diff"
	"github.com/sirupsen/logrus"
	log "github.com/sirupsen/logrus"
	"github.com/wbergg/bordershop-bot/tele"
)

type Items struct {
	ID                int64           `db:"id"`
	IsCheapest        sql.NullBool    `db:"ischeapest"`
	Price             sql.NullFloat64 `db:"price"`
	DisplayName       string          `db:"displayname"`
	Brand             string          `db:"brand"`
	Image             string          `db:"image"`
	ABV               sql.NullFloat64 `db:"abv"`
	Uom               string          `db:"uom"`
	QtyPrUom          string          `db:"qtypruom"`
	UnitPriceText1    string          `db:"unitpricetext1"`
	UnitPriceText2    string          `db:"unitpricetext2"`
	DiscountText      string          `db:"discounttext"`
	BeforePrice       sql.NullFloat64 `db:"beforeprice"`
	BeforePricePrefix string          `db:"beforepriceprefix"`
	SplashText        string          `db:"splashtext"`
	IsSmileOffer      sql.NullBool    `db:"issmileoffer"`
	IsShopOnly        sql.NullBool    `db:"isshoponly"`
	IsSoldOut         sql.NullBool    `db:"issoldout"`
}

var priceChange bool

func pollData(categories [4]int64, t message.Message) {
	// Read in env variables for DB
	host := os.Getenv("BS_HOST")
	if host == "" {
		panic("No IP address to the database specified")
	}
	port, _ := strconv.ParseInt(os.Getenv("BS_PORT"), 10, 64)
	if port == 0 {
		panic("No port to the database specified")
	}
	user := os.Getenv("BS_USER")
	if user == "" {
		panic("No username to the database specified")
	}
	password := os.Getenv("BS_PASSWORD")
	if password == "" {
		panic("No password to the database specified")
	}
	dbname := os.Getenv("BS_DBNAME")
	if dbname == "" {
		panic("No database name specified")
	}

	//Set up data logging
	f, err := os.OpenFile("bordershop-log.txt", os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0666)
	if err != nil {
		panic(err)
	}
	logrus.SetOutput(f)

	for _, line := range categories {

		result, err := bordershop.GetCategory(line)
		if err != nil {
			panic(err)
		}

		psqlInfo := fmt.Sprintf("host=%s port=%d user=%s "+
			"password=%s dbname=%s sslmode=require", host, port, user, password, dbname)
		db, err := sqlx.Open("postgres", psqlInfo)
		if err != nil {
			panic(err)
		}

		for _, product := range result.Products {

			// Convert product.ID string to int64
			pid, _ := strconv.ParseInt(product.ID, 10, 64)

			// Defrine regexp to remove \n in strings for prettier print
			re := regexp.MustCompile("\\n")

			bordershopItem := Items{
				ID: pid,
				IsCheapest: sql.NullBool{
					Bool:  product.IsCheapest,
					Valid: true,
				},
				Price: sql.NullFloat64{
					Float64: product.Price.AmountAsDecimal,
					Valid:   true,
				},
				DisplayName:    product.DisplayName,
				Brand:          product.Brand,
				Uom:            product.Uom,
				QtyPrUom:       product.QtyPrUom,
				Image:          product.Image,
				UnitPriceText1: product.UnitPriceText1,
				UnitPriceText2: product.UnitPriceText2,
				DiscountText:   product.Discount.DiscountText,
				BeforePrice: sql.NullFloat64{
					Float64: product.Discount.BeforePrice.AmountAsDecimal,
					Valid:   true,
				},
				BeforePricePrefix: product.Discount.BeforePricePrefix,
				SplashText:        product.Discount.SplashText,
				IsSmileOffer: sql.NullBool{
					Bool:  product.Discount.IsSmileOffer,
					Valid: true,
				},
				IsShopOnly: sql.NullBool{
					Bool:  product.AddToBasket.IsShopOnly,
					Valid: true,
				},
				IsSoldOut: sql.NullBool{
					Bool:  product.AddToBasket.IsSoldOut,
					Valid: true,
				},
			}

			query := `SELECT * FROM items WHERE id = $1`

			databaseItem := Items{}

			err = db.Get(&databaseItem, query, product.ID)
			if err != nil {
				fmt.Println(err)
			}
			if databaseItem.ID != pid {
				sqlStatement :=
					`INSERT INTO items (id, ischeapest, price, displayname, brand, image, uom, qtypruom, unitpricetext1, 
						unitpricetext2, discounttext, beforeprice, beforepriceprefix, splashtext, issmileoffer, 
						isshoponly, issoldout) 
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`
				_, err = db.Exec(sqlStatement,
					product.ID,
					product.IsCheapest,
					product.Price.AmountAsDecimal,
					product.DisplayName,
					product.Brand,
					product.Image,
					product.Uom,
					product.QtyPrUom,
					product.UnitPriceText1,
					product.UnitPriceText2,
					product.Discount.DiscountText,
					product.Discount.BeforePrice.AmountAsDecimal,
					product.Discount.BeforePricePrefix,
					product.Discount.SplashText,
					product.Discount.IsSmileOffer,
					product.AddToBasket.IsShopOnly,
					product.AddToBasket.IsSoldOut)

				if err != nil {
					panic(err)
				}
				// Prepare telegram message
				message := ""
				message = message + "*New item added to BORDERSHOP!*\n"
				message = message + "https://scandlines.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" + product.Image + "\n"
				message = message + "\n" + re.ReplaceAllString(product.DisplayName, " ") + "\n"
				message = message + "\n" + "Type: " + re.ReplaceAllString(product.Uom, " ") + "\n"
				message = message + "Amount: " + re.ReplaceAllString(product.UnitPriceText1, " ") + "\n"
				message = message + re.ReplaceAllString(product.UnitPriceText2, " ") + "\n"

				// Handle bool cases on newly added items
				if product.AddToBasket.IsShopOnly == true {
					message = message + "\n" + "*CAN ONLY BE BOUGHT IN SHOP!*" + "\n"
				}
				if product.AddToBasket.IsSoldOut == true {
					message = message + "\n" + "*ITEM IS SOLD OUT!*" + "\n"
				}
				// Log messange and other info
				log.WithFields(logrus.Fields{
					"ID":             product.ID,
					"DisplayName":    product.DisplayName,
					"Uom":            product.Uom,
					"UnitPriceText1": product.UnitPriceText1,
					"UnitPriceText2": product.UnitPriceText2,
					"IsShopOnly":     product.AddToBasket.IsShopOnly,
					"IsSoldOut":      product.AddToBasket.IsSoldOut,
					"Message":        message,
				}).Info("DEBUG from new item added")

				// Send message
				t.SendM(message)
			}
			// Diff bordershop struct with database struct
			if databaseItem.ID == pid {
				changelog, err := diff.Diff(databaseItem, bordershopItem)
				if err != nil {
					fmt.Println(err)
				}
				// If any change occured, do the following
				if len(changelog) > 0 {
					// Prepare telegram message
					message := ""
					message = message + "*UPDATE ON BORDERSHOP!*\n"
					message = message + "https://scandlines.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" + product.Image + "\n" + "\n"

					for _, change := range changelog {
						from := fmt.Sprintf("%v", change.From)
						to := fmt.Sprintf("%v", change.To)
						fmt.Println("Changed " + change.Path[0] + " from " + from + " to " + to)

						// Update changes to the database
						_, err := db.Exec(`UPDATE items SET `+strings.ToLower(change.Path[0])+` = $1 WHERE id = $2`,
							to,
							product.ID)
						if err != nil {
							panic(err)
						}

						//Create update message
						message = message + format(change.Path[0], re.ReplaceAllString(databaseItem.DisplayName, " "), from, to)

						// Log messange and other info
						log.WithFields(logrus.Fields{
							"ID":             product.ID,
							"DisplayName":    product.DisplayName,
							"UnitPriceText2": product.UnitPriceText2,
							"Change Path":    change.Path[0],
							"Change-From":    change.From,
							"Change-To":      change.To,
							"IsShopOnly":     product.AddToBasket.IsShopOnly,
							"IsSoldOut":      product.AddToBasket.IsSoldOut,
							"IsCheapest":     product.IsCheapest,
							"Message":        message,
						}).Info("DEBUG from update on item")
					}

					// Send message
					t.SendM(message)
				}
			}
		}
		defer db.Close()
	}
}

var strDefinitions = map[string]string{
	"Price":              "Price of #NAME has changed from #FROM to #TO SEK\n\n",
	"DiscountText-true":  "#NAME is now on discount!\n\n#TO!",
	"DiscountText-false": "#NAME is no longer on discount!",
	"IsShopOnly-false":   "#NAME can now be bought online!",
	"IsShopOnly-true":    "#NAME can now only be bought in shop!",
	"IsSoldOut-false":    "#NAME is back in stock!",
	"IsSoldOut-true":     "#NAME is sold out!",
	"UnitPriceText2":     "#NAME has changed price!\n\n#TO",
	"Image":              "#NAME has a new image!\n\n",
	"DisplayName":        "#NAME has changed name from #FROM to #TO!",
	"IsCheapest-true":    "#NAME is now classified as cheapest!\n\n",
	"IsCheapest-false":   "#NAME is no longer classified as cheapest.\n\n",
	"IsSmileOffer-true":  "#NAME is now a SMILE :) offer!\n\n",
	"IsSmileOffer-false": "#NAME is no longer a SMILE :) offer.\n\n",
}

func format(event string, item string, from string, to string) string {

	if to == "true" {
		event = event + "-true"
	}
	if to == "false" {
		event = event + "-false"
	}
	if event == "DiscountText" {
		if to == "" {
			event = event + "-false"
		} else {
			event = event + "-true"
		}
	}
	// If price is false, set price to true to avoid sending unittextprice2 as well
	if event == "Price" {
		priceChange = true
	}
	// If price is true, set price to false and return nothing instead unittextprice2
	if priceChange == true && event == "UnitPriceText2" {
		priceChange = false
		return ""
	}

	fmt.Println(event)
	str := strDefinitions[event]
	str = strings.ReplaceAll(str, "#NAME", item)
	str = strings.ReplaceAll(str, "#FROM", from)
	str = strings.ReplaceAll(str, "#TO", to)

	return str
}

func main() {
	// Enable bool debug flag
	debug := flag.Bool("debug", false, "Turns on debug mode and prints to stdout")
	telegramTest := flag.Bool("telegram-test", false, "Sends a test message to specified telegram channel")
	flag.Parse()

	var tg message.Message

	if *debug {
		tg = &terminal.Terminal{}
	} else if *telegramTest {
		// Telegram API key, need some error handling here if key is missing and debug is disabled...
		tgAPIKey := os.Getenv("BS_APIKEY")
		if tgAPIKey == "" {
			panic("No Telegram API key specified")
		}
		// Telegram channel number, need some error handling here if key is missing and debug is disabled...
		channel, _ := strconv.ParseInt(os.Getenv("BS_CHANNEL"), 10, 64)
		if channel == 0 {
			panic("No Telegram channel specified")
		}
		tg = tele.New(tgAPIKey, channel, false, *debug)
		// Set debug to false when loading corals tele packet
		tg.Init(false)
		// Send message
		tg.SendM("DEBUG: test message")
		// End program after sending message
		os.Exit(0)
	} else {
		// Telegram API key, need some error handling here if key is missing and debug is disabled...
		tgAPIKey := os.Getenv("BS_APIKEY")
		if tgAPIKey == "" {
			panic("No Telegram API key specified")
		}
		// Telegram channel number, need some error handling here if key is missing and debug is disabled...
		channel, _ := strconv.ParseInt(os.Getenv("BS_CHANNEL"), 10, 64)
		if channel == 0 {
			panic("No Telegram channel specified")
		}
		tg = tele.New(tgAPIKey, channel, false, *debug)
	}

	// Set debug to false when loading corals tele packet
	tg.Init(false)

	// Categories to index from bordershop.com
	categories := [4]int64{9817, 9818, 9819, 9821}
	// Set up datebase and insert all records
	pollData(categories, tg)

}
