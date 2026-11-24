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
                sh 'rm -f .ai-build-checks.txt'
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
                sh '''set -u
pages="index.html principles.html threat-modeling.html checklist.html ai-jenkins.html"
report_file=".ai-build-checks.txt"
failures=0
: > "$report_file"

record_check() {
    check_name=$1
    shift
    if "$@" >/dev/null 2>&1; then
        printf 'PASS: %s\\n' "$check_name" >> "$report_file"
    else
        printf 'FAIL: %s\\n' "$check_name" >> "$report_file"
        failures=$((failures + 1))
    fi
}

record_check "dist/styles.css exists and is not empty" test -s dist/styles.css

for page in $pages; do
    record_check "dist/$page exists and is not empty" test -s "dist/$page"
    record_check "$page links to styles.css" grep -F 'href="styles.css"' "dist/$page"

    for target in $pages; do
        record_check "$page links to $target" grep -F "href=\\"$target\\"" "dist/$page"
    done
done

if [ "$failures" -gt 0 ]; then
    echo "Build checks failed; individual results were recorded." >&2
    exit 1
fi

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
                    def checkResults = fileExists('.ai-build-checks.txt')
                        ? readFile(file: '.ai-build-checks.txt')
                        : 'Not available; the Test Build stage did not run or produced no results.'
                    def messages = [
                        [
                            role: 'system',
                            content: 'Schrijf een nuttig Nederlandstalig rapport over de Jenkins-build. Benoem de buildstatus en doorlooptijd. Vat de uitgevoerde controles samen, noem hoeveel er slaagden en faalden, en benoem mislukte controles expliciet. Als controles niet zijn uitgevoerd of resultaten ontbreken, zeg dat duidelijk. Gebruik alleen de aangeleverde feiten, verzin geen oorzaken of resultaten en geef hooguit concrete vervolgstappen als advies. De duur is in milliseconden. AI-output bepaalt niet of de build slaagt of gepubliceerd wordt.'
                        ],
                        [
                            role: 'user',
                            content: "Pipelinegegevens: ${JsonOutput.toJson(buildContext)}\nUitgevoerde controles en resultaten:\n${checkResults}"
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
