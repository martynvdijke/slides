package handlers

import (
	"crypto/tls"
	"errors"
	"fmt"
	"net/smtp"
	"strings"

	"slides/emailcfg"
)

type Mailer interface {
	Send(to, subject, body string) error
}

type smtpMailer struct {
	cfg emailcfg.Config
}

func NewMailer() Mailer {
	cfg := emailcfg.Effective()
	return &smtpMailer{cfg: cfg}
}

func (m *smtpMailer) Send(to, subject, body string) error {
	if strings.TrimSpace(m.cfg.Host) == "" {
		return errors.New("email not configured")
	}
	from := m.cfg.From
	if from == "" {
		from = m.cfg.User
	}
	if from == "" {
		from = "noreply@example.com"
	}
	addr := fmt.Sprintf("%s:%d", m.cfg.Host, m.cfg.Port)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", from, to, subject, body)
	var auth smtp.Auth
	if m.cfg.User != "" {
		auth = smtp.PlainAuth("", m.cfg.User, m.cfg.Password, m.cfg.Host)
	}
	switch strings.ToLower(m.cfg.TLS) {
	case "none":
		return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
	case "ssl":
		tlsCfg := &tls.Config{ServerName: m.cfg.Host}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return err
		}
		defer conn.Close()
		c, err := smtp.NewClient(conn, m.cfg.Host)
		if err != nil {
			return err
		}
		defer c.Close()
		if auth != nil {
			if err := c.Auth(auth); err != nil {
				return err
			}
		}
		if err := c.Mail(from); err != nil {
			return err
		}
		if err := c.Rcpt(to); err != nil {
			return err
		}
		w, err := c.Data()
		if err != nil {
			return err
		}
		if _, err := w.Write([]byte(msg)); err != nil {
			return err
		}
		if err := w.Close(); err != nil {
			return err
		}
		return c.Quit()
	default: // starttls
		c, err := smtp.Dial(addr)
		if err != nil {
			return err
		}
		defer c.Close()
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: m.cfg.Host}); err != nil {
				return err
			}
		}
		if auth != nil {
			if err := c.Auth(auth); err != nil {
				return err
			}
		}
		if err := c.Mail(from); err != nil {
			return err
		}
		if err := c.Rcpt(to); err != nil {
			return err
		}
		w, err := c.Data()
		if err != nil {
			return err
		}
		if _, err := w.Write([]byte(msg)); err != nil {
			return err
		}
		if err := w.Close(); err != nil {
			return err
		}
		return c.Quit()
	}
}

var mailer Mailer = nil

func getMailer() Mailer {
	if mailer != nil {
		return mailer
	}
	return NewMailer()
}
