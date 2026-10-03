package emailcfg

import (
	"os"
	"strconv"
	"strings"

	"slides/db"
)

type Stored struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	TLS      string
}

type Config struct {
	Host     string
	Port     int
	User     string
	Password string
	From     string
	TLS      string

	HostSource     string
	PortSource     string
	UserSource     string
	PasswordSource string
	FromSource     string
	TLSSource      string
}

func (c Config) Enabled() bool { return strings.TrimSpace(c.Host) != "" }

func Resolve(stored Stored) Config {
	c := Config{
		HostSource: "default", PortSource: "default", UserSource: "default",
		PasswordSource: "default", FromSource: "default", TLSSource: "default",
		TLS: "starttls",
	}
	c.TLSSource = "default"
	if stored.Host != "" {
		c.Host = stored.Host
		c.HostSource = "db"
	}
	if stored.Port != 0 {
		c.Port = stored.Port
		c.PortSource = "db"
	}
	if stored.User != "" {
		c.User = stored.User
		c.UserSource = "db"
	}
	if stored.Password != "" {
		c.Password = stored.Password
		c.PasswordSource = "db"
	}
	if stored.From != "" {
		c.From = stored.From
		c.FromSource = "db"
	}
	if stored.TLS != "" {
		c.TLS = stored.TLS
		c.TLSSource = "db"
	}
	if v := strings.TrimSpace(os.Getenv("SMTP_HOST")); v != "" {
		c.Host = v
		c.HostSource = "env"
	}
	if v := strings.TrimSpace(os.Getenv("SMTP_PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			c.Port = n
			c.PortSource = "env"
		}
	}
	if v := os.Getenv("SMTP_USER"); v != "" {
		c.User = v
		c.UserSource = "env"
	}
	if v := os.Getenv("SMTP_PASSWORD"); v != "" {
		c.Password = v
		c.PasswordSource = "env"
	}
	if v := strings.TrimSpace(os.Getenv("SMTP_FROM")); v != "" {
		c.From = v
		c.FromSource = "env"
	}
	if v := strings.TrimSpace(os.Getenv("SMTP_TLS")); v != "" {
		c.TLS = strings.ToLower(v)
		c.TLSSource = "env"
	}
	if c.Port == 0 && c.Host != "" {
		switch strings.ToLower(c.TLS) {
		case "ssl":
			c.Port = 465
		default:
			c.Port = 587
		}
	}
	return c
}

func LoadStored() Stored {
	s, err := db.GetEmailSettings()
	if err != nil {
		return Stored{}
	}
	return Stored{Host: s.SMTPHost, Port: s.SMTPPort, User: s.SMTPUser, Password: s.SMTPPassword, From: s.SMTPFrom, TLS: s.SMTPTLS}
}

func Effective() Config { return Resolve(LoadStored()) }

var applied Config

func MarkApplied(c Config) { applied = c }
func Applied() Config      { return applied }
func RestartRequired(stored Stored, appliedCfg Config) bool { return Resolve(stored) != appliedCfg }
