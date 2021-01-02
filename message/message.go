package message

import (
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api"
)

type Message interface {
	Init(bool)
	SendM(string) (tgbotapi.Message, error)
}
