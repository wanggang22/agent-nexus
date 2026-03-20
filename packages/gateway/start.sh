#!/bin/bash
# Install gnome-keyring and dbus for onchainos keyring support
apt-get update -qq && apt-get install -y -qq gnome-keyring dbus-x11 2>/dev/null || true

# Start dbus
export $(dbus-launch)

# Initialize gnome-keyring with empty password (headless mode)
echo "" | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null || true

# Install onchainos if not present
if ! command -v onchainos &> /dev/null; then
  curl -sSL https://raw.githubusercontent.com/okx/onchainos-skills/main/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# Start the gateway
exec node dist/index.js
