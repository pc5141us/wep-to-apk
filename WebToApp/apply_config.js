const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const ANDROID_PROJECT_DIR = __dirname;
const CONFIG_FILE_PATH = path.join(ANDROID_PROJECT_DIR, 'app/src/main/assets/app_config.json');

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
    if (escaped.startsWith('@') || escaped.startsWith('?')) {
        escaped = '\\' + escaped;
    }
    return escaped;
}

function updateAppNameInStrings(appName) {
    const STRINGS_FILE_PATH = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res/values/strings.xml');
    const stringsDir = path.dirname(STRINGS_FILE_PATH);
    if (!fs.existsSync(stringsDir)) fs.mkdirSync(stringsDir, { recursive: true });
    
    const escapedAppName = escapeAndroidString(appName);
    const xmlContent = `<resources>\n    <string name="app_name">${escapedAppName}</string>\n</resources>`;
    fs.writeFileSync(STRINGS_FILE_PATH, xmlContent, 'utf8');
    console.log(`Updated strings.xml with app name: ${appName}`);
}

function downloadFile(url, dest, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
            reject(new Error("Too many redirects"));
            return;
        }

        const protocol = url.startsWith('https') ? https : http;
        protocol.get(url, (response) => {
            const statusCode = response.statusCode;

            // Handle HTTP redirects (301, 302, 307, 308)
            if ([301, 302, 307, 308].includes(statusCode) && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    redirectUrl = new URL(redirectUrl, url).href;
                }
                resolve(downloadFile(redirectUrl, dest, redirectCount + 1));
                return;
            }

            if (statusCode !== 200) {
                reject(new Error(`Status code: ${statusCode}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => file.close(resolve));
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function updateAppIcon(logoUrl) {
    if (!logoUrl) return;

    let isLocalFile = false;
    let localFilePath = '';

    if (logoUrl.startsWith('/builds/')) {
        isLocalFile = true;
        // Adjust path since this script runs inside WebToApp
        localFilePath = path.join(__dirname, '../builder/public', logoUrl);
    }

    const tempIconPath = path.join(ANDROID_PROJECT_DIR, `app/src/main/res/temp_icon_${Date.now()}.png`);
    const destExt = 'png';

    try {
        // Step 1: Secure the new logo to temporary storage first
        if (isLocalFile && fs.existsSync(localFilePath)) {
            fs.copyFileSync(localFilePath, tempIconPath);
        } else if (logoUrl.startsWith('http')) {
            await downloadFile(logoUrl, tempIconPath);
        } else {
            return; // invalid URL
        }

        // Step 2: Clean up old anydpi files (only if we successfully got the new icon)
        const anydpiDir = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res/mipmap-anydpi-v26');
        const anydpiFiles = ['ic_launcher.xml', 'ic_launcher_round.xml'];
        for (const xmlFile of anydpiFiles) {
            const xmlPath = path.join(anydpiDir, xmlFile);
            if (fs.existsSync(xmlPath)) {
                try { fs.unlinkSync(xmlPath); } catch(e) {}
            }
        }

        // Step 3: Replace old mipmaps with the new launcher icon
        const mipmapFolders = ['mipmap-hdpi', 'mipmap-mdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi'];
        for (const folder of mipmapFolders) {
            const folderPath = path.join(ANDROID_PROJECT_DIR, 'app/src/main/res', folder);
            if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true });

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

            fs.copyFileSync(tempIconPath, destIcon);
            fs.copyFileSync(destIcon, destRoundIcon);
            console.log(`Updated icon in ${folder}`);
        }

        // Clean up temporary icon file
        try { fs.unlinkSync(tempIconPath); } catch(e) {}
    } catch (e) {
        console.error(`Failed to update app icon (using default icon fallback):`, e.message);
        // Clean up temporary file if it was created
        if (fs.existsSync(tempIconPath)) {
            try { fs.unlinkSync(tempIconPath); } catch(err) {}
        }
    }
}

function updatePackageName(appPackage) {
    if (!appPackage) return;
    const GRADLE_FILE_PATH = path.join(ANDROID_PROJECT_DIR, 'app/build.gradle.kts');
    if (!fs.existsSync(GRADLE_FILE_PATH)) {
        console.log("Gradle file not found, skipping package name update");
        return;
    }
    let content = fs.readFileSync(GRADLE_FILE_PATH, 'utf8');
    
    // Replace default applicationId
    content = content.replace(/applicationId\s*=\s*"[^"]*"/g, `applicationId = "${appPackage}"`);
    // Replace dynamic applicationId check
    content = content.replace(/applicationId\s*=\s*project\.property\("customApplicationId"\)\s*as\s*String/g, `applicationId = "${appPackage}"`);
    
    fs.writeFileSync(GRADLE_FILE_PATH, content, 'utf8');
    console.log(`Updated build.gradle.kts with package name: ${appPackage}`);
}

async function main() {
    if (!fs.existsSync(CONFIG_FILE_PATH)) {
        console.log("No config found, skipping pre-build apply");
        return;
    }
    const config = JSON.parse(fs.readFileSync(CONFIG_FILE_PATH, 'utf8'));
    if (config.appName) {
        updateAppNameInStrings(config.appName);
    }
    if (config.appPackage) {
        updatePackageName(config.appPackage);
    }
    if (config.logoUrl) {
        await updateAppIcon(config.logoUrl);
    }
}

main().catch(console.error);
