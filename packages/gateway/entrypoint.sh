#!/bin/bash
set -e

# Start D-Bus session
eval $(dbus-launch --sh-syntax)
export DBUS_SESSION_BUS_ADDRESS

# Start and unlock gnome-keyring with empty password
echo -n "" | gnome-keyring-daemon --start --unlock --components=secrets,pkcs11 2>/dev/null || true
export GNOME_KEYRING_CONTROL

echo "[entrypoint] D-Bus: $DBUS_SESSION_BUS_ADDRESS"
echo "[entrypoint] Keyring ready"

# Run the gateway
exec node packages/gateway/dist/index.js
