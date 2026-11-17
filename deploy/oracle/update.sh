#!/usr/bin/env bash
# Update the game server to the latest main (the Render "Manual Deploy" of the Oracle VM).
set -euo pipefail
DIR=/opt/music-land
git -C "$DIR" fetch -q origin main && git -C "$DIR" reset -q --hard origin/main
docker build -q -t music-land-server "$DIR"
docker rm -f music-land-server >/dev/null
docker run -d --name music-land-server --restart unless-stopped --memory 700m --memory-swap 1500m --env-file /etc/music-land.env -p 127.0.0.1:2567:2567 music-land-server >/dev/null
echo "Updated to $(git -C "$DIR" log --oneline -1)"
