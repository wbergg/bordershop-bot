package config

import (
	"encoding/json"
	"os"
)

type TGCreds struct {
	TgAPIKey  string `json:"tgAPIkey"`
	TgChannel string `json:"tgChannel"`
}

type Config struct {
	Telegram   TGCreds `json:"Telegram"`
	Categories []int64 `json:"categories"`
}

func LoadConfig() (Config, error) {
	var c Config
	data, err := os.ReadFile("./config/config.json")
	if err != nil {
		return Config{}, err
	}
	err = json.Unmarshal(data, &c)
	if err != nil {
		return Config{}, err
	}

	return c, nil
}
