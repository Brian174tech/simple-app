pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'mkdir -p dist && cp -f *.html styles.css dist/'
            }
        }

        stage('Test Build') {
            steps {
                sh '''python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

build_dir = Path("dist")
pages = sorted(build_dir.glob("*.html"))
if not pages:
    raise SystemExit("Build failed: no HTML pages found in dist/")

errors = []

class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.ids = set()
        self.has_stylesheet = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.add(attrs["id"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.has_stylesheet = True
            self.links.append(attrs.get("href", ""))
        elif tag == "a" and "href" in attrs:
            self.links.append(attrs["href"])

for page in pages:
    parser = PageParser()
    try:
        parser.feed(page.read_text(encoding="utf-8"))
        parser.close()
    except Exception as error:
        errors.append(f"{page}: invalid HTML ({error})")
        continue

    if not parser.has_stylesheet:
        errors.append(f"{page}: stylesheet link is missing")

    for href in parser.links:
        target_url = urlsplit(href)
        if target_url.scheme or target_url.netloc or not target_url.path:
            continue

        target = page.parent / target_url.path
        if not target.is_file():
            errors.append(f"{page}: linked file does not exist: {href}")
        elif target_url.fragment and target.suffix == ".html":
            target_parser = PageParser()
            target_parser.feed(target.read_text(encoding="utf-8"))
            if target_url.fragment not in target_parser.ids:
                errors.append(f"{page}: linked anchor does not exist: {href}")

if errors:
    raise SystemExit("\\n".join(errors))

print(f"Build checks passed for {len(pages)} HTML pages.")
PY'''
            }
        }

        stage('Publish Build') {
            steps {
                echo 'Publishing is not configured; no files were published.'
            }
        }
    }
}
