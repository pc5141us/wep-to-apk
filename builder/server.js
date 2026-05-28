const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// Works both locally (../WebToApp) and in Docker (/app/WebToApp)
const ANDROID_PROJECT_DIR = process.env.ANDROID_PROJECT_DIR ||
    path.join(__dirname, '../WebToApp');
const CONFIG_FILE_PATH = path.join(ANDROID_PROJECT_DIR, 'app/src/main/assets/app_config.json');
const BUILDS_DIR = path.join(__dirname, 'public/builds');

// Create builds directory if it doesn't exist
if (!fs.existsSync(BUILDS_DIR)) {
    fs.mkdirSync(BUILDS_DIR, { recursive: true });
}


// Android XML String escaping helper
function escapeAndroidString(str) {
    let escaped = str.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '\\\'';
            case '"': return '\\"';
            default: return c;
        }
    });
    // Escape leading @ or ? which can be interpreted as resources in Android XML
    if (escaped.startsWith('@') || escaped.startsWith('?')) {
        escaped = '\\' + escaped;
    }
    return escaped;
}

// Update strings.xml with selected app name
function updateAppNameInStrings(appName) {
    const STRINGS_FILE_PATH = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res/values/strings.xml');
    const stringsDir = path.dirname(STRINGS_FILE_PATH);
    if (!fs.existsSync(stringsDir)) {
        fs.mkdirSync(stringsDir, { recursive: true });
    }
    const escapedAppName = escapeAndroidString(appName);
    const xmlContent = `<resources>\n    <string name="app_name">${escapedAppName}</string>\n</resources>`;
    fs.writeFileSync(STRINGS_FILE_PATH, xmlContent, 'utf8');
}

// Download file utility
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Status code: ${response.statusCode}`));
                return;
            }
            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

// Clean and write app launcher icon
async function updateAppIcon(logoUrl) {
    if (!logoUrl) return;

    // Check if it's a local uploaded file
    let isLocalFile = false;
    let localFilePath = '';

    if (logoUrl.startsWith('/builds/')) {
        isLocalFile = true;
        localFilePath = path.join(__dirname, 'public', logoUrl);
    } else if (logoUrl.includes('/builds/')) {
        const parts = logoUrl.split('/builds/');
        if (parts.length > 1) {
            isLocalFile = true;
            localFilePath = path.join(BUILDS_DIR, parts[1]);
        }
    }

    // =====================================================================
    // CRITICAL FIX: Delete mipmap-anydpi-v26 adaptive icon XMLs.
    // On Android 8+, these XML files have HIGHER priority than density-
    // specific PNGs in mipmap-hdpi etc., so without removing them our
    // custom icon is silently ignored and the default robot icon appears.
    // =====================================================================
    const anydpiDir = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res/mipmap-anydpi-v26');
    const anydpiFiles = ['ic_launcher.xml', 'ic_launcher_round.xml'];
    for (const xmlFile of anydpiFiles) {
        const xmlPath = path.join(anydpiDir, xmlFile);
        if (fs.existsSync(xmlPath)) {
            try { fs.unlinkSync(xmlPath); } catch(e) {}
        }
    }

    // Also remove the adaptive icon XML drawables that are referenced by anydpi
    const drawableDir = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res/drawable');
    const adaptiveDrawables = ['ic_launcher_foreground.xml', 'ic_launcher_background.xml'];
    for (const drawFile of adaptiveDrawables) {
        const drawPath = path.join(drawableDir, drawFile);
        if (fs.existsSync(drawPath)) {
            try { fs.unlinkSync(drawPath); } catch(e) {}
        }
    }

    // Save icon as PNG in every mipmap density folder
    const mipmapFolders = [
        'mipmap-hdpi',
        'mipmap-mdpi',
        'mipmap-xhdpi',
        'mipmap-xxhdpi',
        'mipmap-xxxhdpi'
    ];

    // Always save as PNG to ensure widest compatibility
    const destExt = 'png';

    for (const folder of mipmapFolders) {
        const folderPath = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res', folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }

        // Delete ALL existing icon variants first
        const allExts = ['png', 'webp', 'jpg', 'jpeg'];
        for (const name of ['ic_launcher', 'ic_launcher_round']) {
            for (const e of allExts) {
                const oldFile = path.join(folderPath, `${name}.${e}`);
                if (fs.existsSync(oldFile)) {
                    try { fs.unlinkSync(oldFile); } catch(err) {}
                }
            }
        }

        const destIcon = path.join(folderPath, `ic_launcher.${destExt}`);
        const destRoundIcon = path.join(folderPath, `ic_launcher_round.${destExt}`);

        try {
            if (isLocalFile && fs.existsSync(localFilePath)) {
                fs.copyFileSync(localFilePath, destIcon);
            } else if (logoUrl.startsWith('http')) {
                await downloadFile(logoUrl, destIcon);
            } else {
                continue;
            }
            fs.copyFileSync(destIcon, destRoundIcon);
        } catch (e) {
            console.error(`Failed to update icon for ${folder}:`, e.message);
        }
    }
}

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Custom App Icon Upload Route
app.post('/api/upload-icon', (req, res) => {
    try {
        const { base64Data } = req.body;
        if (!base64Data) {
            return res.status(400).json({ error: "Base64 data is required" });
        }
        
        const matches = base64Data.match(/^data:image\/([a-zA-Z+]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: "Invalid base64 image data" });
        }
        
        const ext = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        
        const uniqueFileName = `uploaded_icon_${Date.now()}.${ext}`;
        const destPath = path.join(BUILDS_DIR, uniqueFileName);
        
        fs.writeFileSync(destPath, buffer);
        
        const fileUrl = `/builds/${uniqueFileName}`;
        res.json({ success: true, url: fileUrl });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
            proxyRes.on('data', (chunk) => {
                body.push(chunk);
            });

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

        proxyReq.on('error', (err) => {
            res.status(500).send(`Proxy Error: ${err.message}`);
        });

        proxyReq.end();
    } catch (err) {
        res.status(500).send(`Invalid URL: ${err.message}`);
    }
});

// Load Config
app.get('/api/config', (req, res) => {
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const config = fs.readFileSync(CONFIG_FILE_PATH, 'utf8');
            res.json(JSON.parse(config));
        } else {
            res.status(404).json({ error: "Config file not found" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Save Config
app.post('/api/config', (req, res) => {
    try {
        const config = req.body;
        
        // Ensure assets directory exists
        const assetsDir = path.dirname(CONFIG_FILE_PATH);
        if (!fs.existsSync(assetsDir)) {
            fs.mkdirSync(assetsDir, { recursive: true });
        }
        
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(config, null, 2), 'utf8');
        
        // Dynamic string resource sync
        if (config.appName) {
            updateAppNameInStrings(config.appName);
        }
        
        res.json({ success: true, message: "Configuration saved successfully" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Build state storage
let activeBuildProcess = null;
let buildLogs = [];
let buildStatus = 'idle'; // 'idle', 'building', 'success', 'failed'
let lastGeneratedApkName = '';
let lastGeneratedAppId = '';

app.post('/api/build', async (req, res) => {
    if (buildStatus === 'building') {
        return res.status(400).json({ error: "Build already in progress" });
    }

    buildStatus = 'building';
    buildLogs = [];
    
    let appName = 'web-app';
    let appPackage = 'com.example.webtoapp';
    let logoUrl = '';
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
            appName = config.appName || 'web-app';
            appPackage = config.appPackage || 'com.example.webtoapp';
            logoUrl = config.logoUrl || '';
        }
    } catch (e) {}

    // Clean appName for filename
    const safeAppName = appName.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
    lastGeneratedApkName = `${safeAppName}.apk`;

    // Clean package name to match valid Android application ID syntax
    let customAppId = appPackage.toLowerCase().replace(/[^a-z0-9._]/g, '');
    if (!customAppId || customAppId.split('.').length < 2) {
        customAppId = 'com.example.webtoapp';
    }
    lastGeneratedAppId = customAppId;

    // Start gradle build process
    const gradlewCmd = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    
    // We run Gradle assembleDebug with custom appId property
    const gradleArgs = ['clean', 'assembleDebug', `-PcustomApplicationId=${customAppId}`];
    
    buildLogs.push(`Starting build for: ${appName}`);
    buildLogs.push(`Package Name: ${customAppId}`);
    buildLogs.push(`Running command: ${gradlewCmd} ${gradleArgs.join(' ')}`);

    // Ensure strings.xml is updated right before build starts
    try {
        updateAppNameInStrings(appName);
        buildLogs.push(`Configured launcher app name in strings.xml successfully.`);
    } catch (err) {
        buildLogs.push(`Warning: could not write to strings.xml: ${err.message}`);
    }

    // Ensure app launcher icon is updated right before build starts
    // Supports: remote http URLs AND locally uploaded icons (/builds/...)
    if (logoUrl && (logoUrl.startsWith('http') || logoUrl.startsWith('/builds/') || logoUrl.includes('/builds/'))) {
        buildLogs.push(`Updating launcher icon from: ${logoUrl}`);
        try {
            await updateAppIcon(logoUrl);
            buildLogs.push(`Custom launcher icons updated successfully.`);
        } catch (err) {
            buildLogs.push(`Warning: could not update launcher icons: ${err.message}`);
        }
    }

    // Grant execute permissions on gradlew first (macOS/Linux)
    if (process.platform !== 'win32') {
        try {
            fs.chmodSync(path.join(ANDROID_PROJECT_DIR, 'gradlew'), '755');
        } catch (e) {
            buildLogs.push(`Warning: could not chmod gradlew: ${e.message}`);
        }
    }

    activeBuildProcess = spawn(gradlewCmd, gradleArgs, {
        cwd: ANDROID_PROJECT_DIR,
        env: { ...process.env, PAGER: 'cat' }
    });

    activeBuildProcess.stdout.on('data', (data) => {
        const logLine = data.toString().trim();
        if (logLine) {
            buildLogs.push(logLine);
        }
    });

    activeBuildProcess.stderr.on('data', (data) => {
        const logLine = data.toString().trim();
        if (logLine) {
            buildLogs.push(`[ERROR] ${logLine}`);
        }
    });

    activeBuildProcess.on('close', (code) => {
        activeBuildProcess = null;
        if (code === 0) {
            buildStatus = 'success';
            buildLogs.push("Build completed successfully!");
            
            const sourceApkPath = path.join(ANDROID_PROJECT_DIR, 'app/build/outputs/apk/debug/app-debug.apk');
            const destApkPath = path.join(BUILDS_DIR, lastGeneratedApkName);
            
            try {
                if (fs.existsSync(sourceApkPath)) {
                    fs.copyFileSync(sourceApkPath, destApkPath);
                    buildLogs.push(`APK saved as: ${lastGeneratedApkName}`);
                } else {
                    buildStatus = 'failed';
                    buildLogs.push("Error: Generated APK not found in outputs!");
                }
            } catch (err) {
                buildStatus = 'failed';
                buildLogs.push(`Error copying APK: ${err.message}`);
            }
        } else {
            buildStatus = 'failed';
            buildLogs.push(`Gradle build failed with exit code: ${code}`);
        }
    });

    res.json({ success: true, message: "Build process started" });
});

// SSE endpoint to stream build logs in real-time
app.get('/api/build/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let lastSentIndex = 0;

    const intervalId = setInterval(() => {
        if (lastSentIndex < buildLogs.length) {
            for (let i = lastSentIndex; i < buildLogs.length; i++) {
                res.write(`data: ${JSON.stringify({ log: buildLogs[i], status: buildStatus, apkName: lastGeneratedApkName, appId: lastGeneratedAppId })}\n\n`);
            }
            lastSentIndex = buildLogs.length;
        }

        if (buildStatus === 'success' || buildStatus === 'failed') {
            res.write(`data: ${JSON.stringify({ log: "STREAM_END", status: buildStatus, apkName: lastGeneratedApkName, appId: lastGeneratedAppId })}\n\n`);
            clearInterval(intervalId);
            res.end();
        }
    }, 200);

    req.on('close', () => {
        clearInterval(intervalId);
    });
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
