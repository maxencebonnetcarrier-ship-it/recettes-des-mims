"""Faux hub local qui imite le comportement d'Apps Script (mêmes règles de fusion).

Sert UNIQUEMENT à tester la synchro sans déployer Google Apps Script.
Usage : python test_hub.py [port]   (défaut 8766)
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

TOKEN = "test-token"
ETAT = {}


def fusionner_cases(a, b):
    va = (a or {}).get("v") or {}
    vb = (b or {}).get("v") or {}
    res = {}
    for i in set(va) | set(vb):
        xa, xb = va.get(i), vb.get(i)
        if not xa:
            res[i] = xb
        elif not xb:
            res[i] = xa
        else:
            res[i] = xb if (xb.get("t", 0) >= xa.get("t", 0)) else xa
    return {"v": res, "t": max((a or {}).get("t", 0), (b or {}).get("t", 0))}


def fusionner(actuel, patch):
    out = {}
    for k in set(actuel) | set(patch):
        if k == "__updatedAt":
            continue
        a, b = actuel.get(k), patch.get(k)
        if b is None:
            out[k] = a
        elif a is None:
            out[k] = b
        elif k == "coursesCochees":
            out[k] = fusionner_cases(a, b)
        else:
            ta = a.get("t", 0) if isinstance(a, dict) else 0
            tb = b.get("t", 0) if isinstance(b, dict) else 0
            out[k] = b if tb >= ta else a
    return out


class H(BaseHTTPRequestHandler):
    def _envoyer(self, obj, code=200):
        corps = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def do_GET(self):
        from urllib.parse import urlparse, parse_qs
        q = parse_qs(urlparse(self.path).query)
        if q.get("token", [None])[0] != TOKEN:
            return self._envoyer({"ok": False, "error": "token"}, 401)
        self._envoyer({"ok": True, "state": ETAT, "updatedAt": ETAT.get("__updatedAt", 0)})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        corps = json.loads(self.rfile.read(n) or b"{}")
        if corps.get("token") != TOKEN:
            return self._envoyer({"ok": False, "error": "token"}, 401)
        global ETAT
        import time
        ETAT = fusionner(ETAT, corps.get("patch") or {})
        ETAT["__updatedAt"] = int(time.time() * 1000)
        self._envoyer({"ok": True, "state": ETAT, "updatedAt": ETAT["__updatedAt"]})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print("faux hub sur http://localhost:%d  (token: %s)" % (port, TOKEN))
    HTTPServer(("127.0.0.1", port), H).serve_forever()
