import unittest

from app import app


class SecurityRegressionTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_public_pages_still_load(self):
        for path in (
            "/",
            "/privacy.html",
            "/README.md",
            "/robots.txt",
            "/sitemap.xml",
            "/assets/app.js",
            "/assets/styles.css",
        ):
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 200)

    def test_sensitive_project_files_are_not_served(self):
        blocked_paths = (
            "/.env",
            "/.git/config",
            "/.github/workflows/deployment-validation.yml",
            "/app.py",
            "/config.yaml",
            "/Dockerfile",
            "/docker-compose.yml",
            "/requirements.txt",
            "/Caddyfile",
            "/assets/../app.py",
        )
        for path in blocked_paths:
            with self.subTest(path=path):
                response = self.client.get(path)
                self.assertEqual(response.status_code, 404)

    def test_api_config_contract_and_cors(self):
        response = self.client.get("/api/config", headers={"Origin": "http://localhost"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "http://localhost")
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertEqual(response.headers["X-Robots-Tag"], "noindex, nofollow")
        self.assertEqual(
            set(response.get_json()),
            {"site", "app", "film_brands", "film_formats"},
        )

    def test_unknown_origins_are_blocked(self):
        response = self.client.get("/api/config", headers={"Origin": "https://evil.example"})
        self.assertEqual(response.status_code, 403)

    def test_security_headers_are_applied(self):
        response = self.client.get("/")
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Referrer-Policy"], "strict-origin-when-cross-origin")
        self.assertIn("script-src-attr 'none'", response.headers["Content-Security-Policy"])
        self.assertIn("frame-ancestors 'none'", response.headers["Content-Security-Policy"])

    def test_csp_does_not_need_unsafe_inline(self):
        # JS/CSS ship as same-origin files (assets/app.js, assets/styles.css),
        # not inline, so the CSP shouldn't have to weaken itself for them.
        csp = self.client.get("/").headers["Content-Security-Policy"]
        self.assertNotIn("unsafe-inline", csp)

    def test_hsts_header_is_applied(self):
        response = self.client.get("/")
        self.assertIn("max-age=", response.headers["Strict-Transport-Security"])

    def test_disallowed_methods_are_rejected(self):
        for path in ("/", "/api/config"):
            with self.subTest(path=path):
                response = self.client.options(path)
                self.assertEqual(response.status_code, 405)


if __name__ == "__main__":
    unittest.main()
