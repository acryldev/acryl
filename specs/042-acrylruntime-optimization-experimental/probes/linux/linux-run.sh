# Linux x64 check of the Deno build (042 F11). Run ON the Linux host, in a scratch dir that has: bin/deno (2.9.7), payload/ (d6-payload.mjs with D6_PLATFORM=linux D6_ARCH=x64, plus
# the linux-x64 native packages from npm added to payload/node_modules, plus acryl-harness-runtime copied in), probes/ (this folder's parent), speech.wav, silero_vad.onnx.
# Uses a throwaway HOME/ACRYL_HOME per run, spare ports 3171-3175, nice, and removes everything it starts. Never run it from a real home.
set -u
cd ~/scratch042; D="nice -n 10 ./bin/deno"; export PAYLOAD=$HOME/scratch042/payload HISTFILE=/dev/null
P=probes
echo "=== host: $(uname -srm), $(. /etc/os-release; echo $PRETTY_NAME), glibc $(ldd --version | head -1 | awk '{print $NF}')"
echo "=== N1-N4 native modules (payload copies) ==="; $D run -A --node-modules-dir=manual $P/native-modules.mjs 2>&1 | tail -6
echo "=== sherpa VAD inference ==="
if [ ! -f speech.wav ]; then echo "(no speech.wav yet)"; else $D run -A --node-modules-dir=manual $P/sherpa-vad.mjs silero_vad.onnx speech.wav $PAYLOAD 2>&1 | tail -2; fi
for PORT in 3171 3172; do ss -ltn "sport = :$PORT" | grep -q LISTEN && echo "port $PORT busy" ; done
echo "=== host boot on Deno (3 runs, throwaway home, spare port) ==="
for i in 1 2 3; do PORT=$((3170 + i)); T=$(mktemp -d); mkdir -p $T/home $T/acryl
  HOME=$T/home ACRYL_HOME=$T/acryl ACRYL_WEB_PORT=$PORT timeout 90 $D run -A --node-modules-dir=manual $P/d1-deno-host.mjs 2>&1 | grep -v "^\[acryl-harness-runtime\]\|token=" | tail -2
  ss -ltn "sport = :$PORT" | grep -q LISTEN && echo "PORT $PORT STILL HELD" ; rm -rf "$T"; done
echo "=== Harness turn against a local mock model ==="
T=$(mktemp -d); mkdir -p $T/home $T/acryl
HOME=$T/home ACRYL_HOME=$T/acryl ACRYL_WEB_PORT=3175 timeout 150 $D run -A --node-modules-dir=manual $P/harness-session.mjs 2>&1 | grep -v "^\[acryl-harness-runtime\]\|token=" | tail -8
ss -ltn "sport = :3175" | grep -q LISTEN && echo "PORT 3175 STILL HELD"; rm -rf "$T"
echo "=== leftovers ==="; pgrep -u $USER -fl "scratch042" || echo "no leftover processes"
