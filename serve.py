#!/usr/bin/env python3
"""Rom Patch Manager — small app version (no install, Python 3.8+).

Serves the app/ folder to this computer only (127.0.0.1) and opens it in its own
app window (Edge / Chrome / Chromium "app mode"). Closing the window stops it.
If no such browser is found it opens your normal browser instead.
"""
import functools, http.server, os, shutil, socket, subprocess, sys, threading, time, webbrowser

LAST_PING = [time.time()]

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(HERE, "app")

class Handler(http.server.SimpleHTTPRequestHandler):
    # explicit types: Windows' registry sometimes maps .js to text/plain, which breaks ES modules
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                      ".css": "text/css", ".html": "text/html", ".png": "image/png", ".jpg": "image/jpeg",
                      "": "application/octet-stream"}
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path.startswith("/__ping"):  # the open page says "still here" every few seconds
            LAST_PING[0] = time.time()
            self.send_response(204); self.end_headers(); return
        super().do_GET()

def free_port(start=8765):
    for p in range(start, start + 50):
        with socket.socket() as s:
            if s.connect_ex(("127.0.0.1", p)) != 0:
                return p
    return 0

def app_browser():
    """An installed Chromium-family browser that supports --app windows."""
    names = ["msedge", "chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "brave", "brave-browser", "microsoft-edge", "microsoft-edge-stable"]
    for n in names:
        p = shutil.which(n)
        if p:
            return p
    if os.name == "nt":
        for base in [os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")]:
            if not base:
                continue
            for rel in [r"Microsoft\Edge\Application\msedge.exe", r"Google\Chrome\Application\chrome.exe", r"BraveSoftware\Brave-Browser\Application\brave.exe"]:
                p = os.path.join(base, rel)
                if os.path.exists(p):
                    return p
    return None

def main():
    port = free_port()
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(Handler, directory=APP))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/"
    print(f"Rom Patch Manager is running at {url}")
    exe = None if "--browser" in sys.argv else app_browser()
    if exe:
        # own profile = its own window and process; when the window closes, we stop too
        data = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), ".local", "share")
        profile = os.path.join(data, "Rom-Patch-Manager", "window")
        os.makedirs(profile, exist_ok=True)
        proc = subprocess.Popen([exe, f"--app={url}", f"--user-data-dir={profile}", "--window-size=1400,900", "--no-first-run", "--no-default-browser-check"])
        print("App window open. Closing it stops Rom Patch Manager.")
        proc.wait()
    else:
        # normal browser tab (e.g. Firefox): stop a little while after the last tab is closed
        webbrowser.open(url)
        print("Opened in your browser. It stops by itself after you close the tab.")
        LAST_PING[0] = time.time() + 60  # give the browser time to start
        try:
            while time.time() - LAST_PING[0] < 45:
                time.sleep(3)
        except KeyboardInterrupt:
            pass
    srv.shutdown()

if __name__ == "__main__":
    main()
