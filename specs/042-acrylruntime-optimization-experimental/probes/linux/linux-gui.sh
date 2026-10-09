# Headless GUI check: Xvfb (unpacked from the xvfb .deb, no root, no install) + the cross-built 'deno desktop --target x86_64-unknown-linux-gnu' bundle in desktop/.
# bash shell + HISTFILE=/dev/null + ZDOTDIR so the terminal test cannot write the real shell history. Run detached with output to a file (a WebKit child can hold ssh's pipe open).
set -u; cd ~/scratch042; export HISTFILE=/dev/null
XV=~/scratch042/xvfb/root/usr/bin/Xvfb; DISP=:97
[ -e /tmp/.X11-unix/X97 ] && { echo "display 97 in use"; exit 1; }
$XV $DISP -screen 0 1280x860x24 -nolisten tcp > xvfb.log 2>&1 &
XPID=$!; sleep 2; kill -0 $XPID 2>/dev/null || { echo "Xvfb failed:"; cat xvfb.log | head -5; exit 1; }
echo "Xvfb up (pid $XPID) on $DISP"
chmod +x desktop/ACRYL-linux
T=$(mktemp -d); mkdir -p $T/home $T/acryl
ACRYL_SPIKE_INSPECT=1 ACRYL_SPIKE_JS=$HOME/scratch042/probes/d5-desktop-spike/inspect.js ACRYL_SPIKE_HOLD_SECONDS=14 \
ACRYL_PAYLOAD=$HOME/scratch042/payload DISPLAY=$DISP GDK_BACKEND=x11 LIBGL_ALWAYS_SOFTWARE=1 SHELL=/bin/bash ZDOTDIR=$T \
HOME=$T/home ACRYL_HOME=$T/acryl nice -n 10 ./desktop/ACRYL-linux > $T/run.log 2>&1 &
APID=$!
sleep 34
DISPLAY=$DISP import -window root ~/scratch042/linux-window.png 2>/dev/null && echo "captured Xvfb root (only the app lives on this display)"
echo "--- children of the app ---"; pgrep -P $APID -l | head -4
wait $APID 2>/dev/null
echo "--- app log (token redacted) ---"; sed 's/token=[^ "]*/token=<redacted>/g' $T/run.log | grep -v "^\[acryl-harness-runtime\]" | cut -c1-300 | tail -14
kill $XPID 2>/dev/null; sleep 1; pkill -u $USER -f "scratch042/desktop/ACRYL-linux" 2>/dev/null; rm -rf $T
echo "--- leftovers ---"; pgrep -u $USER -fl "scratch042" || echo "none"; ls /tmp/.X11-unix
