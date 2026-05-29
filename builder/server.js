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
const SESSIONS_DIR = path.join(__dirname, 'sessions');

try {
    if (!fs.existsSync(BUILDS_DIR)) {
        fs.mkdirSync(BUILDS_DIR, { recursive: true });
    }
} catch (e) {
    console.warn(`[WARNING] Failed to create BUILDS_DIR: ${e.message}`);
}

try {
    if (!fs.existsSync(SESSIONS_DIR)) {
        fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
} catch (e) {
    console.warn(`[WARNING] Failed to create SESSIONS_DIR: ${e.message}`);
}

// Session state storage
const sessions = {};
let globalBuildInProgress = false; // Lock to prevent simultaneous local compilation

function getSession(sessionId) {
    const id = sessionId || 'default';
    if (!sessions[id]) {
        sessions[id] = {
            buildLogs: [],
            buildStatus: 'idle',
            lastRunId: null
        };
    }
    return sessions[id];
}

function getSessionConfigPath(sessionId) {
    const id = sessionId || 'default';
    const dir = path.join(SESSIONS_DIR, id);
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {
            // Ignore directory creation errors on read-only filesystems (e.g. Vercel)
        }
    }
    return path.join(dir, 'app_config.json');
}

// In-memory config storage fallback for serverless environments (Vercel)
const memoryConfigs = {};

function getSessionConfig(sessionId) {
    const id = sessionId || 'default';
    if (memoryConfigs[id]) {
        return memoryConfigs[id];
    }
    
    const sessionConfigPath = getSessionConfigPath(id);
    if (fs.existsSync(sessionConfigPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(sessionConfigPath, 'utf8'));
            memoryConfigs[id] = config;
            return config;
        } catch (e) {
            console.error("Error reading session config file:", e);
        }
    }
    return null;
}

function saveSessionConfig(sessionId, config) {
    const id = sessionId || 'default';
    memoryConfigs[id] = config;
    
    const sessionConfigPath = getSessionConfigPath(id);
    try {
        fs.writeFileSync(sessionConfigPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (e) {
        console.warn(`[WARNING] Failed to write session config to disk: ${e.message}`);
    }
}

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Fetch Config
app.get('/api/config', async (req, res) => {
    try {
        const sessionId = req.query.sessionId || 'default';
        
        // If session specific config exists, return it
        const config = getSessionConfig(sessionId);
        if (config) {
            return res.json(config);
        }

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
                            const gitConfig = JSON.parse(decoded);
                            // Cache to session config
                            saveSessionConfig(sessionId, gitConfig);
                            res.json(gitConfig);
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

        // Initialize new sessions with a clean, empty configuration
        const defaultEmptyConfig = {
            appName: "",
            primaryUrl: "",
            logoUrl: "",
            splashImageUrl: "",
            appPackage: "",
            themeColorHex: "#2196F3",
            isDarkTheme: false,
            sidebarItems: [],
            enableZoom: true,
            showProgressBar: true,
            userAgent: ""
        };
        saveSessionConfig(sessionId, defaultEmptyConfig);
        res.json(defaultEmptyConfig);
    } catch (e) {
        res.status(500).json({ error: "Error loading configuration" });
    }
});

// Save Config
app.post('/api/config', async (req, res) => {
    try {
        const sessionId = req.query.sessionId || req.body.sessionId || 'default';
        const config = req.body;
        const configString = JSON.stringify(config, null, 2);
        
        saveSessionConfig(sessionId, config);

        if (githubApi.isGithubEnvSet()) {
            // Push to GitHub
            const base64Content = Buffer.from(configString).toString('base64');
            await githubApi.uploadFileToGithub('WebToApp/app/src/main/assets/app_config.json', base64Content, 'Update app_config.json via Dashboard');
            res.json({ success: true, message: "Configuration saved to GitHub" });
            return;
        }

        res.json({ success: true, message: "Configuration saved locally for session" });
    } catch (e) {
        res.status(500).json({ error: `Error saving configuration: ${e.message}` });
    }
});

// Upload Icon
app.post('/api/upload-icon', async (req, res) => {
    try {
        const sessionId = req.query.sessionId || 'default';
        const { base64Data } = req.body;
        if (!base64Data) {
            return res.status(400).json({ error: "No image data provided" });
        }

        const matches = base64Data.match(/^data:image\/([a-zA-Z0-9]+);base64,/);
        const ext = matches ? matches[1] : 'png';
        const fileName = `uploaded_icon_${sessionId}_${Date.now()}.${ext}`;
        
        if (githubApi.isGithubEnvSet()) {
            const githubPath = `builder/public/builds/${fileName}`;
            await githubApi.uploadFileToGithub(githubPath, base64Data, `Upload icon ${fileName}`);
            res.json({ success: true, url: `/builds/${fileName}` });
            return;
        }

        // Local fallback
        const destPath = path.join(BUILDS_DIR, fileName);
        const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
        try {
            fs.writeFileSync(destPath, base64Content, 'base64');
            res.json({ success: true, url: `/builds/${fileName}` });
        } catch (e) {
            console.error("Icon upload write error:", e);
            res.status(500).json({ error: `Failed to save uploaded icon: ${e.message}` });
        }
    } catch (e) {
        res.status(500).json({ error: `Error saving image: ${e.message}` });
    }
});

// Build APK endpoint
app.post('/api/build', async (req, res) => {
    try {
        const sessionId = req.query.sessionId || req.body.sessionId || 'default';
        const session = getSession(sessionId);
        
        session.buildLogs = [];
        session.buildStatus = 'building';
        
        if (githubApi.isGithubEnvSet()) {
            session.buildLogs.push("Triggering GitHub Actions Build Workflow...");
            
            // Get the ID of the latest run BEFORE triggering the new one to prevent polling old completed runs
            try {
                const latestRun = await githubApi.getLatestWorkflowRun();
                if (latestRun) {
                    session.lastRunId = latestRun.id;
                    console.log(`Stored lastRunId: ${session.lastRunId} before triggering`);
                }
            } catch(e) {
                console.error("Failed to get latest run ID before trigger:", e);
            }
            
            let appName = 'WebToApp';
            let appPackage = 'com.example.webtoapp';
            let appConfigStr = '{}';

            if (req.body && req.body.config) {
                const config = req.body.config;
                appName = config.appName || appName;
                appPackage = config.appPackage || appPackage;
                appConfigStr = JSON.stringify(config);
                console.log(`Using dynamic configuration passed in request body: ${appName}`);
            } else {
                const decoded = getSessionConfig(sessionId);
                if (decoded) {
                    appName = decoded.appName || appName;
                    appPackage = decoded.appPackage || appPackage;
                    appConfigStr = JSON.stringify(decoded);
                }
            }
            
            await githubApi.triggerWorkflow(appName, appPackage, appConfigStr);
            session.buildLogs.push("Workflow triggered successfully!");
            session.buildLogs.push("Waiting for GitHub Actions to start...");
            
            res.json({ success: true, message: "GitHub Actions Build triggered", buildStartTime: Date.now() });
            return;
        }

        // Local Build fallback
        if (globalBuildInProgress) {
            return res.status(400).json({ error: "تجميع تطبيق آخر قيد التشغيل حالياً. يرجى المحاولة لاحقاً." });
        }
        
        globalBuildInProgress = true;
        session.buildLogs.push("Starting local Gradle build...");
        
        // Copy session's config to main app_config.json so compiler uses it!
        const sessionConfig = getSessionConfig(sessionId);
        if (sessionConfig) {
            const configString = JSON.stringify(sessionConfig, null, 2);
            try {
                const assetsDir = path.dirname(CONFIG_FILE_PATH);
                if (!fs.existsSync(assetsDir)) {
                    fs.mkdirSync(assetsDir, { recursive: true });
                }
                fs.writeFileSync(CONFIG_FILE_PATH, configString, 'utf8');
                
                // Run apply_config.js to update Android resources (App Name, Package Name, Icon)
                try {
                    const { execSync } = require('child_process');
                    session.buildLogs.push("Applying configuration to Android resources...");
                    execSync('node apply_config.js', { cwd: ANDROID_PROJECT_DIR });
                    session.buildLogs.push("Configuration applied successfully!");
                } catch (err) {
                    session.buildLogs.push(`[WARNING] Failed to apply resource configuration: ${err.message}`);
                    console.error("apply_config error:", err);
                }
            } catch (err) {
                session.buildLogs.push(`[WARNING] Failed to write config file locally: ${err.message}`);
            }
        }

        const gradlewCmd = process.platform === 'win32' 
            ? path.join(ANDROID_PROJECT_DIR, 'gradlew.bat') 
            : path.join(ANDROID_PROJECT_DIR, 'gradlew');
        
        const activeBuildProcess = spawn(gradlewCmd, ['assembleDebug', '--stacktrace'], {
            cwd: ANDROID_PROJECT_DIR,
            env: { ...process.env, PAGER: 'cat' }
        });

        activeBuildProcess.stdout.on('data', (data) => session.buildLogs.push(data.toString().trim()));
        activeBuildProcess.stderr.on('data', (data) => session.buildLogs.push(`[ERROR] ${data.toString().trim()}`));

        activeBuildProcess.on('close', (code) => {
            globalBuildInProgress = false;
            if (code === 0) {
                session.buildStatus = 'success';
                session.buildLogs.push("Local Build completed successfully!");
            } else {
                session.buildStatus = 'failed';
                session.buildLogs.push(`Local Gradle build failed with exit code: ${code}`);
            }
        });

        res.json({ success: true, message: "Local Build process started" });
    } catch (e) {
        globalBuildInProgress = false;
        const sessionId = req.query.sessionId || req.body.sessionId || 'default';
        const session = getSession(sessionId);
        session.buildStatus = 'failed';
        session.buildLogs.push(`Build start error: ${e.message}`);
        res.status(500).json({ error: `Error starting build: ${e.message}` });
    }
});

// Get build logs and status
app.get('/api/build/logs', async (req, res) => {
    try {
        const sessionId = req.query.sessionId || 'default';
        const session = getSession(sessionId);
        
        if (githubApi.isGithubEnvSet()) {
            let appName = 'WebToApp';
            let appPackage = 'com.example.webtoapp';
            
            const decoded = getSessionConfig(sessionId);
            if (decoded) {
                appName = decoded.appName || appName;
                appPackage = decoded.appPackage || appPackage;
            }

            const run = await githubApi.getLatestWorkflowRun();
            const sinceTime = req.query.since ? parseInt(req.query.since) : 0;
            
            if (run) {
                // If run was created before our build request, it's the old run! We must wait.
                const runCreatedAt = new Date(run.created_at).getTime();
                if ((session.lastRunId && run.id === session.lastRunId) || (sinceTime && runCreatedAt < sinceTime)) {
                    return res.json({
                        logs: ["Waiting for GitHub Actions to register the new build request..."],
                        status: 'building'
                    });
                }
                
                let logs = [];
                try {
                    const jobsData = await githubApi.githubRequest('GET', `/actions/runs/${run.id}/jobs`);
                    if (jobsData && jobsData.jobs && jobsData.jobs.length > 0) {
                        const job = jobsData.jobs[0];
                        if (job.steps && job.steps.length > 0) {
                            job.steps.forEach(step => {
                                logs.push(`[GitHub Action] Step: ${step.name} - ${step.status}${step.conclusion ? ` (${step.conclusion})` : ''}`);
                            });
                        }
                    }
                } catch (e) {
                    logs.push(`GitHub Action Status: ${run.status} (${run.conclusion || 'running'})`);
                }
                
                if (run.status === 'completed') {
                    session.buildStatus = run.conclusion === 'success' ? 'success' : 'failed';
                }
                
                const downloadUrl = `/api/download?tag=v-${run.run_number}&filename=${encodeURIComponent(appName)}.apk`;
                
                return res.json({
                    logs: logs,
                    status: session.buildStatus,
                    apkName: downloadUrl,
                    appId: appPackage
                });
            }
        }
        
        // Local Build logs fallback
        const appName = getSessionConfig(sessionId)?.appName || 'WebToApp';
        const appPackage = getSessionConfig(sessionId)?.appPackage || 'com.example.webtoapp';
        
        if (session.buildStatus === 'success') {
            const srcApk = path.join(ANDROID_PROJECT_DIR, 'app/build/outputs/apk/debug/app-debug.apk');
            const destApk = path.join(BUILDS_DIR, `${appName}.apk`);
            if (fs.existsSync(srcApk)) {
                try {
                    fs.copyFileSync(srcApk, destApk);
                } catch(e) {
                    console.error("Failed to copy compiled APK to builds folder:", e);
                }
            }
        }

        res.json({
            logs: session.buildLogs,
            status: session.buildStatus,
            apkName: `/builds/${encodeURIComponent(appName)}.apk`,
            appId: appPackage
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

        let asset = releaseData.assets.find(a => a.name === filename || a.label === filename);
        if (!asset) {
            // Fallback: search for any .apk asset in the release
            asset = releaseData.assets.find(a => a.name.endsWith('.apk'));
        }
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
