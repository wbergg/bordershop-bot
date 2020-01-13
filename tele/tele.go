package tele

import (
	"fmt"

	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api"
)

type Tele struct {
	apikey     string
	channel    int64
	debug      bool
	wbergdebug bool
	bot        *tgbotapi.BotAPI
}

func New(apikey string, channel int64, debug bool, wbergdebug bool) *Tele {
	return &Tele{
		apikey:     apikey,
		channel:    channel,
		debug:      debug,
		wbergdebug: wbergdebug,
	}
}

func (t *Tele) Init(debug bool) {
	var err error
	t.bot, err = tgbotapi.NewBotAPI(t.apikey)
	if err != nil {
		panic(err)
	}

	t.bot.Debug = t.debug

	if t.bot.Debug {
		fmt.Println("Enabled Telegram debug")
		u := tgbotapi.NewUpdate(0)
		u.Timeout = 20

		updates, err := t.bot.GetUpdatesChan(u)
		if err != nil {
			fmt.Println(err)
		}

		for update := range updates {
			if update.Message == nil {
				fmt.Println(update)
				continue
			}

		}
	}

}

func (t *Tele) SendM(message string) (tgbotapi.Message, error) {

	if t.wbergdebug {
		fmt.Println(message)
		return tgbotapi.Message{}, nil
	}

	msg := tgbotapi.NewMessage(t.channel, message)
	msg.ParseMode = "markdown"

	if t.debug {
		fmt.Println(msg)
	}
	m, err := t.bot.Send(msg)

	return m, err

}
