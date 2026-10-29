#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
print('Szigetkert: http://localhost:8080', flush=True)
ThreadingHTTPServer(('0.0.0.0', 8080), SimpleHTTPRequestHandler).serve_forever()
