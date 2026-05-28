const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const githubApi = require('./github_api');

const app = express();
const PORT = process.env.PORT || 3000;

const ANDROID_PROJECT_DIR = process.env.ANDROID_PROJECT_DIR || path.join(__dirname, '../WebToApp');
const CONFIG_FILE_PATH = path.join(ANDROID_PROJECT_DIR, 'app/src/main/assets/app_config.json');
const BUILDS_DIR = path.join(__dirname, 'public/builds');

if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Fetch Config
app.get('/api/config', async (req, res) => {
    try {
        if (githubApi.isGithubEnvSet()) {
            // Fetch from GitHub directly to get latest state in Vercel
            const https = require('https');
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${process.env.GITHUB_REPO}/contents/WebToApp/app/src/main/assets/app_config.json`,
                headers: { 'User-Agent': 'WebToApp', 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
            };
            https.get(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.content) {
                            const decoded = Buffer.from(parsed.content, 'base64').toString('utf8');
                            res.json(JSON.parse(decoded));
                        } else {
                            res.status(404).json({ error: "Config not found on GitHub" });
                        }
                    } catch(e) {
                        res.status(500).json({ error: "Parse error" });
                    }
                });
            }).on('error', e => res.status(500).json({ error: e.message }));
            return;
        }

        // Local fallback
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
            res.json(config);
        } else {
            res.status(404).json({ error: "Config file not found locally" });
        }
    } catch (e) {
        res.status(500).json({ error: "Error loading configuration" });
    }
});

// Save Config
app.post('/api/config', async (req, res) => {
    try {
        const config = req.body;
        const configString = JSON.stringify(config, null, 2);
        
        if (githubApi.isGithubEnvSet()) {
            // Push to GitHub
            const base64Content = Buffer.from(configString).toString('base64');
            await githubApi.uploadFileToGithub('WebToApp/app/src/main/assets/app_config.json', base64Content, 'Update app_config.json via Dashboard');
            res.json({ success: true, message: "Configuration saved to GitHub" });
            return;
        }

        // Local fallback
        const assetsDir = path.dirname(CONFIG_FILE_PATH);
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        fs.writeFileSync(CONFIG_FILE_PATH, configString, 'utf8');
        res.json({ success: true, message: "Configuration saved locally" });
    } catch (e) {
        res.status(500).json({ error: `Error saving configuration: ${e.message}` });
    }
});

// Upload Icon
app.post('/api/upload-icon', async (req, res) => {
    try {
        const { base64Data } = req.body;
        if (!base64Data) {
            return res.status(400).json({ error: "No image data provided" });
        }

        const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
        const ext = matches ? matches[1] : 'png';
        const fileName = `uploaded_icon_${Date.now()}.${ext}`;
        
        if (githubApi.isGithubEnvSet()) {
            const githubPath = `builder/public/builds/${fileName}`;
            await githubApi.uploadFileToGithub(githubPath, base64Data, `Upload icon ${fileName}`);
            res.json({ success: true, url: `/builds/${fileName}` });
            return;
        }

        // Local fallback
        const destPath = path.join(BUILDS_DIR, fileName);
        const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(destPath, base64Content, 'base64');
        res.json({ success: true, url: `/builds/${fileName}` });
    } catch (e) {
        res.status(500).json({ error: `Error saving image: ${e.message}` });
    }
});

// Build APK endpoint
let activeBuildProcess = null;
let buildLogs = [];
let buildStatus = 'idle';
let lastRunId = null;

app.post('/api/build', async (req, res) => {
    try {
        buildLogs = [];
        buildStatus = 'building';
        
        if (githubApi.isGithubEnvSet()) {
            buildLogs.push("Triggering GitHub Actions Build Workflow...");
            
            // Get the ID of the latest run BEFORE triggering the new one to prevent polling old completed runs
            try {
                const latestRun = await githubApi.getLatestWorkflowRun();
                if (latestRun) {
                    lastRunId = latestRun.id;
                    console.log(`Stored lastRunId: ${lastRunId} before triggering`);
                }
            } catch(e) {
                console.error("Failed to get latest run ID before trigger:", e);
            }
            
            // State-safe config fetch from GitHub
            let appName = 'WebToApp';
            let appPackage = 'com.example.webtoapp';
            try {
                const https = require('https');
                const configData = await new Promise((resolve, reject) => {
                    const options = {
                        hostname: 'api.github.com',
                        path: `/repos/${process.env.GITHUB_REPO}/contents/WebToApp/app/src/main/assets/app_config.json`,
                        headers: { 
                            'User-Agent': 'WebToApp-Builder', 
                            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    };
                    https.get(options, (response) => {
                        let data = '';
                        response.on('data', chunk => data += chunk);
                        response.on('end', () => {
                            try {
                                resolve(JSON.parse(data));
                            } catch(e) {
                                resolve({});
                            }
                        });
                    }).on('error', reject);
                });
                if (configData.content) {
                    const decoded = JSON.parse(Buffer.from(configData.content, 'base64').toString('utf8'));
                    appName = decoded.appName || appName;
                    appPackage = decoded.appPackage || appPackage;
                }
            } catch (e) {
                console.error("Failed to read latest config from GitHub:", e);
            }
            
            await githubApi.triggerWorkflow(appName, appPackage);
            buildLogs.push("Workflow triggered successfully!");
            buildLogs.push("Waiting for GitHub Actions to start...");
            
            // We simulate the build progress by checking GitHub Actions API in the logs endpoint
            res.json({ success: true, message: "GitHub Actions Build triggered" });
            return;
        }

        // Local Build fallback
        if (activeBuildProcess) {
            return res.status(400).json({ error: "Build already in progress locally" });
        }
        
        buildLogs.push("Starting local Gradle build...");
        const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
        
        activeBuildProcess = spawn(gradlewCmd, ['assembleDebug', '--stacktrace'], {
            cwd: ANDROID_PROJECT_DIR,
            env: { ...process.env, PAGER: 'cat' }
        });

        activeBuildProcess.stdout.on('data', (data) => buildLogs.push(data.toString().trim()));
        activeBuildProcess.stderr.on('data', (data) => buildLogs.push(`[ERROR] ${data.toString().trim()}`));

        activeBuildProcess.on('close', (code) => {
            activeBuildProcess = null;
            if (code === 0) {
                buildStatus = 'success';
                buildLogs.push("Local Build completed successfully!");
            } else {
                buildStatus = 'failed';
                buildLogs.push(`Local Gradle build failed with exit code: ${code}`);
            }
        });

        res.json({ success: true, message: "Local Build process started" });
    } catch (e) {
        buildStatus = 'failed';
        buildLogs.push(`Build start error: ${e.message}`);
        res.status(500).json({ error: `Error starting build: ${e.message}` });
    }
});

// SSE endpoint to stream build logs
app.get('/api/build/logs', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (githubApi.isGithubEnvSet()) {
        // State-safe config fetch from GitHub
        let appName = 'WebToApp';
        let appPackage = 'com.example.webtoapp';
        try {
            const https = require('https');
            const configData = await new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.github.com',
                    path: `/repos/${process.env.GITHUB_REPO}/contents/WebToApp/app/src/main/assets/app_config.json`,
                    headers: { 
                        'User-Agent': 'WebToApp-Builder', 
                        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                };
                https.get(options, (response) => {
                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => {
                        try {
                            resolve(JSON.parse(data));
                        } catch(e) {
                            resolve({});
                        }
                    });
                }).on('error', reject);
            });
            if (configData.content) {
                const decoded = JSON.parse(Buffer.from(configData.content, 'base64').toString('utf8'));
                appName = decoded.appName || appName;
                appPackage = decoded.appPackage || appPackage;
            }
        } catch (e) {
            console.error("Failed to read latest config inside logs:", e);
        }

        // Poll GitHub Actions
        const intervalId = setInterval(async () => {
            try {
                const run = await githubApi.getLatestWorkflowRun();
                if (run) {
                    // Skip if GitHub hasn't registered the new run yet
                    if (lastRunId && run.id === lastRunId) {
                        res.write(`data: ${JSON.stringify({ log: "Waiting for GitHub Actions to register the new build request...", status: 'building' })}\n\n`);
                        return;
                    }

                    res.write(`data: ${JSON.stringify({ log: `GitHub Action Status: ${run.status} (${run.conclusion || 'running'})`, status: buildStatus })}\n\n`);
                    if (run.status === 'completed') {
                        buildStatus = run.conclusion === 'success' ? 'success' : 'failed';
                        // Proxy download link that bypasses private repo login requirements
                        const downloadUrl = `/api/download?tag=v-${run.run_number}&filename=${encodeURIComponent(appName)}.apk`;
                        res.write(`data: ${JSON.stringify({ 
                            log: `Build finished with status: ${buildStatus}`, 
                            status: buildStatus,
                            apkName: downloadUrl,
                            appId: appPackage
                        })}\n\n`);
                        res.write(`data: ${JSON.stringify({ 
                            log: "STREAM_END", 
                            status: buildStatus,
                            apkName: downloadUrl,
                            appId: appPackage
                        })}\n\n`);
                        clearInterval(intervalId);
                        res.end();
                    }
                }
            } catch (e) {
                res.write(`data: ${JSON.stringify({ log: `Error polling GitHub Actions: ${e.message}`, status: 'failed' })}\n\n`);
            }
        }, 5000);
        
        req.on('close', () => clearInterval(intervalId));
        return;
    }

    // Local logging stream
    let lastSentIndex = 0;
    const intervalId = setInterval(() => {
        if (lastSentIndex < buildLogs.length) {
            for (let i = lastSentIndex; i < buildLogs.length; i++) {
                res.write(`data: ${JSON.stringify({ log: buildLogs[i], status: buildStatus })}\n\n`);
            }
            lastSentIndex = buildLogs.length;
        }

        if (buildStatus === 'success' || buildStatus === 'failed') {
            res.write(`data: ${JSON.stringify({ log: "STREAM_END", status: buildStatus })}\n\n`);
            clearInterval(intervalId);
            res.end();
        }
    }, 200);

    req.on('close', () => clearInterval(intervalId));
});

// Fail-safe redirect for cached clients prepending /builds/
app.get('/builds/api/download', (req, res) => {
    const query = req.url.split('?')[1];
    console.log(`Fail-safe redirecting cached client request to /api/download?${query}`);
    res.redirect(`/api/download?${query}`);
});

// Private Repo authenticated APK Download proxy endpoint
app.get('/api/download', async (req, res) => {
    const { tag, filename } = req.query;
    if (!tag || !filename) {
        return res.status(400).send("Missing tag or filename parameters");
    }

    try {
        console.log(`Download request received for Tag: ${tag}, File: ${filename}`);
        
        // 1. Fetch release info to find asset ID
        const releaseData = await githubApi.githubRequest('GET', `/releases/tags/${tag}`);
        if (!releaseData || !releaseData.assets) {
            return res.status(404).send("Release or assets not found");
        }

        const asset = releaseData.assets.find(a => a.name === filename);
        if (!asset) {
            return res.status(404).send(`Asset named '${filename}' not found in release ${tag}`);
        }

        // 2. Query GitHub API for redirect to S3 storage
        const options = {
            hostname: 'api.github.com',
            path: `/repos/${process.env.GITHUB_REPO}/releases/assets/${asset.id}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
                'Accept': 'application/octet-stream',
                'User-Agent': 'WebToApp-Builder'
            }
        };

        const reqApi = https.request(options, (resApi) => {
            if (resApi.statusCode === 302 && resApi.headers.location) {
                // Redirect user to the presigned, completely public S3 download URL
                console.log("Successfully retrieved redirect to S3. Redirecting user...");
                res.redirect(resApi.headers.location);
            } else {
                console.error(`Failed to get S3 redirect: Status ${resApi.statusCode}`);
                res.status(500).send(`Failed to fetch secure download location from GitHub: Status ${resApi.statusCode}`);
            }
        });

        reqApi.on('error', (err) => {
            console.error("API Redirect Request Error:", err);
            res.status(500).send(`GitHub Connection error: ${err.message}`);
        });
        
        reqApi.end();

    } catch (e) {
        console.error("Download endpoint exception:", e);
        res.status(500).send(`Server download error: ${e.message}`);
    }
});

// URL Iframe Proxy to bypass X-Frame-Options
app.get('/api/proxy', (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).send("URL parameter is required");
    }

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl;
    }

    try {
        const parsedUrl = new URL(targetUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const requestOptions = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        };

        const proxyReq = protocol.request(requestOptions, (proxyRes) => {
            if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                let redirectUrl = proxyRes.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, targetUrl).href;
                }
                return res.redirect(`/api/proxy?url=${encodeURIComponent(redirectUrl)}`);
            }

            res.setHeader('Content-Type', proxyRes.headers['content-type'] || 'text/html');

            let body = [];
            proxyRes.on('data', (chunk) => body.push(chunk));

            proxyRes.on('end', () => {
                const buffer = Buffer.concat(body);
                const contentType = proxyRes.headers['content-type'] || '';
                
                if (contentType.includes('text/html')) {
                    let html = buffer.toString('utf8');
                    const baseTag = `<base href="${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}">`;
                    
                    if (html.includes('<head>')) {
                        html = html.replace('<head>', `<head>${baseTag}`);
                    } else if (html.includes('<HEAD>')) {
                        html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
                    } else {
                        html = baseTag + html;
                    }
                    res.send(html);
                } else {
                    res.send(buffer);
                }
            });
        });

        proxyReq.on('error', (err) => res.status(500).send(`Proxy Error: ${err.message}`));
        proxyReq.end();
    } catch (err) {
        res.status(500).send(`Invalid URL: ${err.message}`);
    }
});

// Export for Vercel
module.exports = app;

// Start server locally if not in Vercel
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server is running at http://localhost:${PORT}`);
    });
}
