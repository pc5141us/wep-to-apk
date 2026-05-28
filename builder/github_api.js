const https = require('https');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // e.g., "pc5141us/wep-to-apk"

function githubRequest(method, endpoint, data = null) {
    return new Promise((resolve, reject) => {
        if (!GITHUB_TOKEN || !GITHUB_REPO) {
            return reject(new Error("GITHUB_TOKEN or GITHUB_REPO not set in environment"));
        }

        const options = {
            hostname: 'api.github.com',
            path: `/repos/${GITHUB_REPO}${endpoint}`,
            method: method,
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'WebToApp-Builder'
            }
        };

        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                try {
                    const parsed = responseBody ? JSON.parse(responseBody) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsed);
                    } else {
                        reject(new Error(`GitHub API Error: ${res.statusCode} - ${parsed.message || responseBody}`));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function getFileSha(path) {
    try {
        const fileData = await githubRequest('GET', `/contents/${path}`);
        return fileData.sha;
    } catch (e) {
        return null; // File doesn't exist
    }
}

async function uploadFileToGithub(filePath, base64Content, commitMessage) {
    const sha = await getFileSha(filePath);
    
    // Ensure base64 doesn't have the data URL prefix
    const cleanBase64 = base64Content.replace(/^data:image\/\w+;base64,/, '');

    const data = {
        message: commitMessage,
        content: cleanBase64,
        branch: 'main'
    };
    
    if (sha) {
        data.sha = sha;
    }

    return githubRequest('PUT', `/contents/${filePath}`, data);
}

async function triggerWorkflow(appName, appPackage, appConfig = '{}') {
    return githubRequest('POST', `/actions/workflows/build-apk.yml/dispatches`, {
        ref: 'main',
        inputs: {
            appName: appName || 'WebToApp',
            appPackage: appPackage || 'com.example.webtoapp',
            appConfig: appConfig
        }
    });
}

async function getLatestWorkflowRun() {
    const runs = await githubRequest('GET', `/actions/runs?branch=main&per_page=1`);
    if (runs && runs.workflow_runs && runs.workflow_runs.length > 0) {
        return runs.workflow_runs[0];
    }
    return null;
}

module.exports = {
    uploadFileToGithub,
    triggerWorkflow,
    getLatestWorkflowRun,
    githubRequest,
    isGithubEnvSet: () => !!(GITHUB_TOKEN && GITHUB_REPO)
};
