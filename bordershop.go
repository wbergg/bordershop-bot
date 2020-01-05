package main

import (
	"database/sql"
	"fmt"
	"os"
	"regexp"
	"strconv"
	"strings"

	"github.com/coral/bordershop"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/r3labs/diff"
)

type Items struct {
	ID             int64           `db:"id"`
	Price          sql.NullFloat64 `db:"price"`
	DisplayName    string          `db:"displayname"`
	Image          string          `db:"image"`
	ABV            sql.NullFloat64 `db:"abv"`
	UnitPriceText2 string          `db:"unitpricetext2"`
	IsShopOnly     sql.NullBool    `db:"isshoponly"`
	IsSoldOut      sql.NullBool    `db:"issoldout"`
}

func poll_data(categories [4]int64) {
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
				Image:          product.Image,
				UnitPriceText2: product.UnitPriceText2,
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
					`INSERT INTO items (id, displayname, price, image, unitpricetext2, isshoponly, issoldout) 
			VALUES ($1, $2, $3, $4, $5, $6, $7)`
				_, err = db.Exec(sqlStatement,
					product.ID,
					product.DisplayName,
					product.Price.AmountAsDecimal,
					product.Image,
					product.UnitPriceText2,
					product.AddToBasket.IsShopOnly,
					product.AddToBasket.IsSoldOut)

				if err != nil {
					panic(err)
				}
				// Prepare telegram message
				message := ""
				message = message + "*New item added to BORDERSHOP!*\n"
				message = message + "https://scandlines.cloudimg.io/fit/800x800/fbright5/_img_/" + product.Image + "\n"
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
				// Future send telegram message using telegram()
			}
			// Diff bordershop struct with database struct
			if databaseItem.ID == pid {
				changelog, err := diff.Diff(databaseItem, bordershopItem)
				if err != nil {
					fmt.Println(err)
				}
				var changed []string
				if len(changelog) > 0 {
					// Prepare telegram message
					message := ""
					message = message + "*UPDATE ON BORDERSHOP!*\n"
					message = message + "https://scandlines.cloudimg.io/fit/800x800/fbright5/_img_/" + product.Image + "\n"
					message = message + re.ReplaceAllString(product.DisplayName, " ") + "\n"
					for _, change := range changelog {
						from := fmt.Sprintf("%v", change.From)
						to := fmt.Sprintf("%v", change.To)
						//fmt.Println("Changed " + change.Path[0] + " from " + from + " to " + to)

						// Update changes
						_, err := db.Exec(`UPDATE items SET `+strings.ToLower(change.Path[0])+` = $1 WHERE id = $2`,
							to,
							product.ID)
						if err != nil {
							panic(err)
						}
						// Prepare rest of message
						if change.Path[0] == "Price" {
							message = message + "*PRICE HAS CHANGED!!!*\n"
							message = message + "From: " + from + " to " + to + "\n"
						}
						if change.Path[0] == "IsShopOnly" {
							message = message + "*SHOPONLY HAS CHANGED!!!*\n"
							message = message + "From: " + from + " to " + to + "\n"
						}
					}
					fmt.Println(message)
					// Future send telegram message using telegram()
				}
			}
		}
		defer db.Close()
	}
}

func telegram() {
	fmt.Println("future use - send diff to telegram")
}

func main() {
	// Categories to index from bordershop.com
	categories := [4]int64{9817, 9818, 9819, 9821}
	// Set up datebase and insert all records
	poll_data(categories)
}