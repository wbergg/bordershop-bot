package main

import (
	"database/sql"
	"flag"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/r3labs/diff"
	"github.com/wbergg/bordershop-bot/config"
	"github.com/wbergg/bordershop-bot/db"
	"github.com/wbergg/telegram"

	"github.com/coral/bordershop"
	"github.com/sirupsen/logrus"
	log "github.com/sirupsen/logrus"
)

func pollData(categories []int64, t *telegram.Tele, d *db.DBobject) error {

	for _, line := range categories {

		result, err := bordershop.GetCategory(line)
		if err != nil {
			return fmt.Errorf("failed to get category %d: %w", line, err)
		}

		for _, product := range result.Products {
			// Reset priceChange per product to avoid state leaking between products
			priceChange := false

			// Convert product.ID string to int64
			pid, err := strconv.ParseInt(product.ID, 10, 64)
			if err != nil {
				log.WithField("productID", product.ID).Error("failed to parse product ID, skipping")
				continue
			}

			bordershopItem := db.DBItemResp{
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

			databaseItem, err := d.GetItemsByPid(pid)
			if err != nil {
				log.WithError(err).WithField("pid", pid).Debug("item not found in db")
			}

			if databaseItem.ID != pid {
				err = d.InsertFull(pid,
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
					log.WithError(err).WithField("pid", pid).Error("failed to insert item")
					continue
				}

				// Prepare telegram message
				message := ""
				message = message + "*New item added to BORDERSHOP!*\n"
				message = message + "https://cmxsapnc.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" + product.Image + "\n"
				message = message + "\n" + strings.ReplaceAll(product.DisplayName, "\n", " ") + "\n"
				message = message + "\n" + "Type: " + strings.ReplaceAll(product.Uom, "\n", " ") + "\n"
				message = message + "Amount: " + strings.ReplaceAll(product.UnitPriceText1, "\n", " ") + "\n"
				message = message + strings.ReplaceAll(product.UnitPriceText2, "\n", " ") + "\n"

				// Handle bool cases on newly added items
				if product.AddToBasket.IsShopOnly {
					message = message + "\n" + "*CAN ONLY BE BOUGHT IN SHOP!*" + "\n"
				}
				if product.AddToBasket.IsSoldOut {
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
				if _, err := t.SendM(message); err != nil {
					log.WithError(err).Error("failed to send new item telegram message")
				}
			}

			// Diff bordershop struct with database struct
			if databaseItem.ID == pid {
				changelog, err := diff.Diff(databaseItem, bordershopItem)
				if err != nil {
					log.WithError(err).WithField("pid", pid).Error("failed to diff item")
				}
				// If any change occured, do the following
				if len(changelog) > 0 {
					// Prepare telegram message
					message := ""
					message = message + "*UPDATE ON BORDERSHOP!*\n"
					message = message + "https://cmxsapnc.cloudimg.io/fit/220x220/fbright5/\\_img\\_/" + product.Image + "\n" + "\n"

					for _, change := range changelog {
						from := fmt.Sprintf("%v", change.From)
						to := fmt.Sprintf("%v", change.To)
						fmt.Println("Changed " + change.Path[0] + " from " + from + " to " + to)

						// Update changes to the database
						err := d.UpdateChangeByPid(change.Path[0], to, pid)
						if err != nil {
							log.WithError(err).WithFields(logrus.Fields{
								"pid":    pid,
								"column": change.Path[0],
							}).Error("failed to update change in db")
							continue
						}

						//Create update message
						message = message + format(change.Path[0], strings.ReplaceAll(databaseItem.DisplayName, "\n", " "), from, to, &priceChange)

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
					if _, err := t.SendM(message); err != nil {
						log.WithError(err).Error("failed to send update telegram message")
					}
				}
			}
		}
	}
	return nil
}

var strDefinitions = map[string]string{
	"Price":              "Price of #NAME has changed from #FROM to #TO SEK\n\n",
	"DiscountText-true":  "#NAME is now on discount!\n\n#TO!",
	"DiscountText-false": "#NAME is no longer on discount!\n\n",
	"IsShopOnly-false":   "#NAME can now be bought online!\n\n",
	"IsShopOnly-true":    "#NAME can now only be bought in shop!\n\n",
	"IsSoldOut-false":    "#NAME is back in stock!\n\n",
	"IsSoldOut-true":     "#NAME is sold out!\n\n",
	"UnitPriceText2":     "#NAME has changed price!\n\n#TO",
	"Image":              "#NAME has a new image!\n\n",
	"DisplayName":        "#NAME has changed name from #FROM to #TO!\n\n",
	"IsCheapest-true":    "#NAME is now classified as cheapest!\n\n",
	"IsCheapest-false":   "#NAME is no longer classified as cheapest.\n\n",
	"IsSmileOffer-true":  "#NAME is now a SMILE :) offer!\n\n",
	"IsSmileOffer-false": "#NAME is no longer a SMILE :) offer.\n\n",
}

func format(event string, item string, from string, to string, priceChange *bool) string {

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
		*priceChange = true
	}
	// If price is true, set price to false and return nothing instead unittextprice2
	if *priceChange && event == "UnitPriceText2" {
		*priceChange = false
		return ""
	}

	fmt.Println(event)
	str := strDefinitions[event]
	str = strings.ReplaceAll(str, "#NAME", item)
	str = strings.ReplaceAll(str, "#FROM", from)
	str = strings.ReplaceAll(str, "#TO", to)

	return str
}

func dbSetup(categories []int64, d *db.DBobject) error {
	for _, line := range categories {

		result, err := bordershop.GetCategory(line)
		if err != nil {
			return fmt.Errorf("failed to get category %d: %w", line, err)
		}

		for _, product := range result.Products {
			// Convert product.ID string to int64
			pid, err := strconv.ParseInt(product.ID, 10, 64)
			if err != nil {
				log.WithField("productID", product.ID).Error("failed to parse product ID, skipping")
				continue
			}

			// Add item to db if it does not exsist
			err = d.GetRowItemByPid(pid)
			if err == sql.ErrNoRows {
				err = d.InsertFull(pid,
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
					return fmt.Errorf("failed to insert product %d: %w", pid, err)
				}
			}
		}
	}
	return nil
}

func main() {
	var debug_telegram *bool
	var debug_stdout *bool

	// Enable bool debug flag
	debug_telegram = flag.Bool("debug", false, "Turns on debug for telegram")
	debug_stdout = flag.Bool("stdout", false, "Turns on stdout rather than sending to telegram")
	telegramTest := flag.Bool("telegram-test", false, "Sends a test message to specified telegram channel")

	flag.Parse()

	// Load config
	config, err := config.LoadConfig()
	if err != nil {
		log.Fatal("Could not load config, check config/config.json: ", err)
	}

	channel, err := strconv.ParseInt(config.Telegram.TgChannel, 10, 64)
	if err != nil {
		log.Fatal("Could not convert Telegram channel to int64: ", err)
	}

	// Set up data logging
	f, err := os.OpenFile("bordershop-log.txt", os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0666)
	if err != nil {
		log.Fatal("Could not open log file: ", err)
	}
	defer f.Close()
	logrus.SetOutput(f)

	// Initiate telegram
	tg := telegram.New(config.Telegram.TgAPIKey, channel, *debug_telegram, *debug_stdout)
	tg.Init(*debug_telegram)

	// Setup db
	d, err := db.Open()
	if err != nil {
		log.Fatal("Could not open database: ", err)
	}

	// Check if DB is set up, if not, set it up (first time only)
	if d.Setup == 0 {
		fmt.Println("Looks like it's the first time - Populating DB...")
		if err := dbSetup(config.Categories, &d); err != nil {
			log.Fatal("DB setup failed: ", err)
		}
		fmt.Println("DB population sucess! Please rerun the program!")
		os.Exit(0)
	}

	// Program start
	if *telegramTest {
		tg.SendM("DEBUG: bordershop-bot test message")
		// End program after sending message
		os.Exit(0)
	} else {
		// Poll and diff data from categories
		if err := pollData(config.Categories, tg, &d); err != nil {
			log.Fatal("pollData failed: ", err)
		}
	}

	// Close DB
	d.Close()
}
