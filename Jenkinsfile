import groovy.json.JsonOutput
import groovy.json.JsonSlurperClassic

@NonCPS
String parseAiSummary(String responseJson) {
    def response = new JsonSlurperClassic().parseText(responseJson)
    def summary = response.choices?.getAt(0)?.message?.content
    return summary instanceof String ? summary.trim() : ''
}

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
                    def messages = [
                        [
                            role: 'system',
                            content: 'Schrijf een korte Nederlandse samenvatting van de Jenkins-build. Benoem de status en doorlooptijd; de opgegeven duur is in milliseconden. Geef alleen advies; bepaal niet of de build mag slagen of publiceren.'
                        ],
                        [
                            role: 'user',
                            content: "Pipelinegegevens: ${JsonOutput.toJson(buildContext)}"
                        ]
                    ]
                    def summary = ''
                    for (def maxTokens in [512, 1024]) {
                        def requestBody = JsonOutput.toJson([
                            model: 'qwen3.8:27b',
                            messages: messages,
                            max_tokens: maxTokens
                        ])
                        writeFile file: '.ai-request.json', text: requestBody

                        echo "Waiting for AI summary (attempt ${maxTokens == 512 ? 1 : 2}/2; timeout 5 minutes)."
                        withCredentials([string(credentialsId: 'nova-api-key', variable: 'NOVA_API_KEY')]) {
                            sh '''
                                set -eu
                                printf 'header = "Authorization: Bearer %s"\\n' "$NOVA_API_KEY" |
                                    curl --config - --fail --silent --show-error --max-time 300 \\
                                        --header 'Content-Type: application/json' \\
                                        --data-binary @.ai-request.json \\
                                        --output .ai-response.json \\
                                        https://api.nova.datalabrotterdam.nl/v1/chat/completions
                            '''
                        }

                        def responseJson = readFile(file: '.ai-response.json')
                        summary = parseAiSummary(responseJson)
                        if (!summary.isEmpty()) {
                            break
                        }
                    }

                    if (summary.isEmpty()) {
                        throw new IllegalStateException('AI service returned no summary text after retrying.')
                    }

                    writeFile file: 'ai-summary.txt', text: "${summary.take(5000)}\n"
                    archiveArtifacts artifacts: 'ai-summary.txt'
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
