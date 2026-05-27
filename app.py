import os
from flask import Flask, jsonify, send_from_directory
import yaml

app = Flask(__name__)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.yaml")


@app.route("/api/config")
def get_config():
    """Parse config.yaml server-side and return it as JSON."""
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return jsonify(data)


@app.route("/", defaults={"path": "index.html"})
@app.route("/<path:path>")
def static_files(path):
    """Serve static files from the project root."""
    return send_from_directory(BASE_DIR, path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
