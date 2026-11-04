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
                sh '''set -eu
pages="index.html principles.html threat-modeling.html checklist.html ai-jenkins.html"

test -s dist/styles.css || {
    echo "Build failed: dist/styles.css is missing or empty." >&2
    exit 1
}

for page in $pages; do
    test -s "dist/$page" || {
        echo "Build failed: dist/$page is missing or empty." >&2
        exit 1
    }

    grep -F 'href="styles.css"' "dist/$page" >/dev/null || {
        echo "Build failed: $page does not link to styles.css." >&2
        exit 1
    }

    for target in $pages; do
        grep -F -e "href=\"$target\"" -e "href='$target'" -e "href=$target" "dist/$page" >/dev/null || {
            echo "Build failed: $page does not link to $target." >&2
            exit 1
        }
    done
done

echo "Build checks passed for all 5 HTML pages and local navigation links."'''
            }
        }

        stage('Publish Build') {
            steps {
                echo 'Publishing is not configured; no files were published.'
            }
        }
    }
}
