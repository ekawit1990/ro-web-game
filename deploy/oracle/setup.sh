#!/usr/bin/env bash
# Music Land game server on a free Oracle Cloud VM (Ubuntu 22.04/24.04, ARM Ampere or AMD micro).
# Run on the VM:  curl -fsSL https://raw.githubusercontent.com/ekawit1990/ro-web-game/main/deploy/oracle/setup.sh | sudo bash
# Safe to run again (it rebuilds and restarts). Updating later: sudo bash /opt/music-land/deploy/oracle/update.sh
set -euo pipefail

REPO=https://github.com/ekawit1990/ro-web-game.git
DIR=/opt/music-land
SUPABASE_URL=https://udylzxxjayoprpfkxxjf.supabase.co
ENV_FILE=/etc/music-land.env

[ "$(id -u)" = 0 ] || { echo "Run with sudo"; exit 1; }

echo "== 1/6 Installing Docker and git"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io git curl iptables-persistent
systemctl enable --now docker

echo "== 2/6 Opening ports 80 and 443 in the VM firewall"
# Oracle's Ubuntu images reject everything but SSH in iptables: let the web ports in, before that REJECT rule
for p in 80 443; do
  iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -p tcp --dport $p -j ACCEPT
done
netfilter-persistent save

echo "== 3/6 The Supabase service role key"
if [ ! -s "$ENV_FILE" ]; then
  echo "Paste the SUPABASE_SERVICE_ROLE_KEY (the same one as on Render > Environment). It won't show while you paste:"
  read -rs KEY < /dev/tty
  echo
  [ -n "$KEY" ] || { echo "No key given"; exit 1; }
  printf 'SUPABASE_URL=%s\nSUPABASE_SERVICE_ROLE_KEY=%s\nPORT=2567\n' "$SUPABASE_URL" "$KEY" > "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  echo "(kept the key in $ENV_FILE)"
fi

echo "== 4/6 Getting the game code"
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch -q origin main && git -C "$DIR" reset -q --hard origin/main
else git clone -q --depth 1 "$REPO" "$DIR"; fi

echo "== 5/6 Building and starting the game server"
docker build -q -t music-land-server "$DIR"
docker rm -f music-land-server >/dev/null 2>&1 || true
docker run -d --name music-land-server --restart unless-stopped --env-file "$ENV_FILE" -p 127.0.0.1:2567:2567 music-land-server >/dev/null

echo "== 6/6 HTTPS (wss://) with a free automatic certificate"
IP=$(curl -fsS https://api.ipify.org)
HOST="$(echo "$IP" | tr . -).sslip.io"
docker rm -f music-land-https >/dev/null 2>&1 || true
docker run -d --name music-land-https --restart unless-stopped --network host -v music-land-caddy:/data caddy:2 \
  caddy reverse-proxy --from "$HOST" --to 127.0.0.1:2567 >/dev/null

echo "Waiting for the certificate..."
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null "https://$HOST/" 2>/dev/null || curl -sS -o /dev/null -w '%{http_code}' "https://$HOST/" 2>/dev/null | grep -q '^[2-4]'; then OK=1; break; fi
  sleep 4
done
echo
if [ "${OK:-}" = 1 ]; then
  echo "DONE. Game server address (send this to Claude):  wss://$HOST"
else
  echo "The server runs, but https://$HOST doesn't answer yet."
  echo "Check that ports 80 and 443 are open in Oracle: Networking > Virtual cloud networks > your VCN > Security Lists > Default > Add Ingress Rules (0.0.0.0/0, TCP, 80 and 443)."
  echo "Then run this script again. Logs: sudo docker logs music-land-https"
fi
