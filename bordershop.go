package main

import (
	"database/sql"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/coral/bordershop"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/r3labs/diff"
	"github.com/wbergg/bordershop-bot/tele"
)

type Items struct {
	ID                int64           `db:"id"`
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

func poll_data(categories [4]int64, t *tele.Tele) {
	// Read in env variables for DB
	host := os.Getenv("BS_HOST")
	port := 5432
	user := os.Getenv("BS_USER")
	password := os.Getenv("BS_PASSWORD")
	dbname := os.Getenv("BS_DBNAME")

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
					`INSERT INTO items (id, price, displayname, brand, image, uom, qtypruom, unitpricetext1, 
						unitpricetext2, discounttext, beforeprice, beforepriceprefix, splashtext, issmileoffer, 
						isshoponly, issoldout) 
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`
				_, err = db.Exec(sqlStatement,
					product.ID,
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
				message = message + re.ReplaceAllString(product.DisplayName, " ") + "\n"
				message = message + re.ReplaceAllString(product.UnitPriceText2, " ") + "\n"
				//message = message + "Price: " + fmt.Sprintf("%f", product.Price.AmountAsDecimal) + "\n"
				if product.AddToBasket.IsShopOnly == true {
					message = message + "*CAN ONLY BE BOUGHT IN SHOP!*" + "\n"
				}
				if product.AddToBasket.IsSoldOut == true {
					message = message + "*ITEM IS SOLD OUT!*" + "\n"
				}
				fmt.Println(message)
				// Send message to Telegram
				t.SendM(message)
			}
			// Diff bordershop struct with database struct
			if databaseItem.ID == pid {
				changelog, err := diff.Diff(databaseItem, bordershopItem)
				if err != nil {
					fmt.Println(err)
				}
				if len(changelog) > 0 {
					// Prepare telegram message
					message := ""
					message = message + "*UPDATE ON BORDERSHOP!*\n"
					message = message + "https://scandlines.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" + product.Image + "\n" + "\n"
					//message = message + re.ReplaceAllString(product.DisplayName, " ") + "\n"
					for _, change := range changelog {
						from := fmt.Sprintf("%v", change.From)
						to := fmt.Sprintf("%v", change.To)
						fmt.Println("Changed " + change.Path[0] + " from " + from + " to " + to)

						// Update changes
						_, err := db.Exec(`UPDATE items SET `+strings.ToLower(change.Path[0])+` = $1 WHERE id = $2`,
							to,
							product.ID)
						if err != nil {
							panic(err)
						}

						//Create update message
						message = message + format(change.Path[0], re.ReplaceAllString(databaseItem.DisplayName, " "), from, to)
					}
					fmt.Println(message)
					// Send message to Telegram
					t.SendM(message)
				}
			}
		}
		defer db.Close()
	}
}

func main() {

	debug := flag.Bool("debug", false, "Turns on debug mode and prints to stdout")
	flag.Parse()

	api_key := os.Getenv("BS_APIKEY")
	channel, _ := strconv.ParseInt(os.Getenv("BS_CHANNEL"), 10, 64)
	tg := tele.New(api_key, channel, false, *debug)

	// Categories to index from bordershop.com
	categories := [4]int64{9817, 9818, 9819, 9821}
	// Set up datebase and insert all records
	poll_data(categories, tg)

}

var strDefinitions = map[string]string{
	"Price":              "Price of #NAME has changed from #FROM to #TO SEK\n\n",
	"DiscountText-true":  "#NAME is now on discount!\n\n#TO!",
	"DiscountText-false": "#NAME is no longer on discount!",
	"IsShopOnly-false":   "#NAME can now be bought online!",
	"IsShopOnly-true":    "#NAME can now only be bought in shop!",
	"IsSoldOut-false":    "#NAME is back in stock!",
	"IsSoldOut-true":     "#NAME is sold out!",
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
	fmt.Println(event)
	str := strDefinitions[event]
	str = strings.ReplaceAll(str, "#NAME", item)
	str = strings.ReplaceAll(str, "#FROM", from)
	str = strings.ReplaceAll(str, "#TO", to)

	return str
}
