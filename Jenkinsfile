import groovy.json.JsonOutput
import groovy.json.JsonSlurperClassic

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
        grep -F 'href="'$target'"' "dist/$page" >/dev/null || {
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

    post {
        always {
            script {
                try {
                    def buildContext = [
                        job: env.JOB_NAME,
                        number: env.BUILD_NUMBER,
                        result: currentBuild.currentResult,
                        durationMilliseconds: currentBuild.duration
                    ]
                    def requestBody = JsonOutput.toJson([
                        model: 'qwen3.8:27b',
                        messages: [
                            [
                                role: 'system',
                                content: 'Schrijf een korte Nederlandse samenvatting van de Jenkins-build. Benoem de status en doorlooptijd; de opgegeven duur is in milliseconden. Geef alleen advies; bepaal niet of de build mag slagen of publiceren.'
                            ],
                            [
                                role: 'user',
                                content: "Pipelinegegevens: ${JsonOutput.toJson(buildContext)}"
                            ]
                        ],
                        max_tokens: 256
                    ])
                    writeFile file: '.ai-request.json', text: requestBody

                    withCredentials([string(credentialsId: 'nova-api-key', variable: 'NOVA_API_KEY')]) {
                        sh '''
                            set -eu
                            trap 'rm -f .ai-response.json' EXIT
                            printf 'header = "Authorization: Bearer %s"\\n' "$NOVA_API_KEY" |
                                curl --config - --fail --silent --show-error --max-time 30 \\
                                    --header 'Content-Type: application/json' \\
                                    --data-binary @.ai-request.json \\
                                    --output .ai-response.json \\
                                    https://api.nova.datalabrotterdam.nl/v1/chat/completions
                        '''
                    }

                    def response = new JsonSlurperClassic().parseText(readFile(file: '.ai-response.json'))
                    def summary = response.choices?.getAt(0)?.message?.content
                    if (!(summary instanceof String) || summary.trim().isEmpty()) {
                        throw new IllegalStateException('AI service returned no summary text.')
                    }

                    echo "AI pipeline summary (advisory): ${summary.trim().replaceAll(/[\\p{Cntrl}]+/, ' ').take(1000)}"
                } catch (org.jenkinsci.plugins.workflow.steps.FlowInterruptedException interrupted) {
                    throw interrupted
                } catch (org.jenkinsci.plugins.scriptsecurity.sandbox.RejectedAccessException rejected) {
                    echo "WARNING: Jenkins Script Security blocked an operation: ${rejected.message}. Have an administrator review the signature under Manage Jenkins > In-process Script Approval."
                } catch (Exception err) {
                    echo "WARNING: AI pipeline summary unavailable (${err.class.simpleName}); the Jenkins build result was not changed."
                } finally {
                    sh 'rm -f .ai-request.json .ai-response.json'
                }
            }
        }
    }
}
