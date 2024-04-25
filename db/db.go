package db

import (
	"database/sql"
	"os"
	"strings"

	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3"
)

type DBobject struct {
	db    *sqlx.DB
	Setup int
}

type DBItemResp struct {
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

func Open() DBobject {
	db, err := sqlx.Connect("sqlite3", "./db/db.sql")
	if err != nil {
		panic(err)
	}

	setup := initDB(db)

	return DBobject{
		db:    db,
		Setup: setup,
	}
}

func initDB(db *sqlx.DB) int {

	// Check if table "inventory" and "loans" exists
	dbQuery1 := `SELECT COUNT(name) as P FROM sqlite_master WHERE type='table' AND name='items';`

	var s1 int
	err := db.Get(&s1, dbQuery1)
	if err != nil {
		panic(err)
	}

	// If tables doesn't exist, create it from the schema
	if s1 == 0 {
		dat, err := os.ReadFile("db/db.schema")
		if err != nil {
			panic(err)
		}
		db.MustExec(string(dat))
		//fmt.Println(dat)
	}
	return s1
}

func (d *DBobject) Close() {
	d.db.Close()
}

func (d *DBobject) GetAllItems() ([]DBItemResp, error) {
	databaseResp := []DBItemResp{}

	dbQuery := "SELECT * FROM items"

	err := d.db.Select(&databaseResp, dbQuery)
	if err != nil {
		panic(err)
	}

	return databaseResp, nil
}

func (d *DBobject) GetRowItemByPid(pid int64) error {

	var result string

	dbQuery := "SELECT * FROM items WHERE id=?"

	row := d.db.QueryRow(dbQuery, pid)
	err := row.Scan(&result)
	if err != nil && err != sql.ErrNoRows {
		return err
	}
	return err
}

func (d *DBobject) InsertFull(ID int64, IsCheapest bool, Price float64, DisplayName string, Brand string, Image string, Uom string, QtyPrUom string, UnitPriceText1 string,
	UnitPriceText2 string, DiscountText string, BeforePrice float64, BeforePricePrefix string, SplashText string, IsSmileOffer bool,
	IsShopOnly bool, IsSoldOut bool) error {

	dbQuery :=
		`INSERT INTO items (id, ischeapest, price, displayname, brand, image, uom, qtypruom, unitpricetext1,
	unitpricetext2, discounttext, beforeprice, beforepriceprefix, splashtext, issmileoffer,
	isshoponly, issoldout)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`
	_, err := d.db.Exec(dbQuery,
		ID,
		IsCheapest,
		Price,
		DisplayName,
		Brand,
		Image,
		Uom,
		QtyPrUom,
		UnitPriceText1,
		UnitPriceText2,
		DiscountText,
		BeforePrice,
		BeforePricePrefix,
		SplashText,
		IsSmileOffer,
		IsShopOnly,
		IsSoldOut)

	if err != nil {
		panic(err)
	}
	return err
}

func (d *DBobject) GetItemsByPid(pid int64) (DBItemResp, error) {

	databaseItem := DBItemResp{}

	dbQuery := `SELECT * FROM items WHERE id = $1`
	err := d.db.Get(&databaseItem, dbQuery, pid)
	return databaseItem, err
}

func (d *DBobject) UpdateChangeByPid(column string, value string, pid int64) error {

	dbQuery := `UPDATE items SET ` + strings.ToLower(column) + ` = $1 WHERE id = $2`

	_, err := d.db.Exec(dbQuery, value, pid)

	return err

}
