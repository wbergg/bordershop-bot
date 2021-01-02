package terminal

import (
	"fmt"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api"
)

type Terminal struct {
}

func (t *Terminal) Init(bool) {
	fmt.Println("DEBUG: Virtual terminal output to stdout initiated")
}

func (t *Terminal) SendM(message string) (tgbotapi.Message, error) {
	fmt.Println(message)
	return tgbotapi.Message{}, nil
}
