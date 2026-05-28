// Global State
let sessionId = localStorage.getItem('session_id');
if (!sessionId) {
    sessionId = 'session_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('session_id', sessionId);
}

let config = {
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

let activePageId = null; // null means main site URL
let modalMode = 'add'; // 'add' or 'edit'
let editingItemId = null;
let selectedModalIcon = 'Link';
let isPackageNameManuallyEdited = false;

// DOM Elements
const elements = {
    // Inputs
    appNameInput: document.getElementById('app-name'),
    primaryUrlInput: document.getElementById('primary-url'),
    logoUrlInput: document.getElementById('logo-url'),
    iconUploadInput: document.getElementById('icon-upload-input'),
    splashImageUrlInput: document.getElementById('splash-image-url'),
    splashUploadInput: document.getElementById('splash-upload-input'),
    appPackageInput: document.getElementById('app-package'),
    customHexInput: document.getElementById('custom-hex'),
    enableZoomInput: document.getElementById('enable-zoom'),
    showProgressBarInput: document.getElementById('show-progress-bar'),
    userAgentInput: document.getElementById('user-agent'),
    
    // Theme Buttons
    lightModeBtn: document.getElementById('light-mode-btn'),
    darkModeBtn: document.getElementById('dark-mode-btn'),
    colorDots: document.querySelectorAll('.color-dot'),
    
    // Containers
    sidebarItemsContainer: document.getElementById('sidebar-items-container'),
    consoleOutputContainer: document.getElementById('console-output-container'),
    apkDownloadContainer: document.getElementById('apk-download-container'),
    
    // Build Actions
    generateApkBtn: document.getElementById('generate-apk-btn'),
    previewAppBtn: document.getElementById('preview-app-btn'),
    buildStatusIndicator: document.getElementById('build-status-indicator'),
    buildProgressContainer: document.getElementById('build-progress-container'),
    buildProgressBar: document.getElementById('build-progress-bar'),
    buildProgressText: document.getElementById('build-progress-text'),
    clearConsoleBtn: document.getElementById('clear-console-btn'),
    consoleStatusBadge: document.getElementById('console-status-badge'),
    
    // Mock Preview Elements
    phoneScreen: document.getElementById('phone-screen-element'),
    mockAppTitle: document.getElementById('mock-app-title'),
    mockDrawerTitle: document.getElementById('mock-drawer-title'),
    mockDrawerNav: document.getElementById('mock-drawer-nav'),
    mockDrawerElement: document.getElementById('mock-drawer-element'),
    mockDrawerOverlay: document.getElementById('mock-drawer-overlay'),
    mockDrawerOpenBtn: document.getElementById('mock-drawer-open'),
    mockWebviewUrl: document.getElementById('mock-webview-url'),
    mockWebviewContainer: document.getElementById('mock-webview-container'),
    
    // Modals
    pageModal: document.getElementById('page-modal'),
    addPageBtn: document.getElementById('add-page-btn'),
    closeModalX: document.getElementById('close-modal-x'),
    cancelModalBtn: document.getElementById('cancel-modal-btn'),
    savePageBtn: document.getElementById('save-page-btn'),
    modalPageTitle: document.getElementById('modal-page-title'),
    modalPageUrl: document.getElementById('modal-page-url'),
    modalPageHtml: document.getElementById('modal-page-html'),
    iconSelectItems: document.querySelectorAll('.icon-select-item'),
    radioPageTypes: document.getElementsByName('page-type'),
    urlInputWrapper: document.getElementById('url-input-wrapper'),
    htmlInputWrapper: document.getElementById('html-input-wrapper'),
    modalTitleText: document.getElementById('modal-title-text')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    setupTabSwitching();
    setupInputsBinding();
    setupColorPalette();
    setupDrawerInteraction();
    setupModalEvents();
    setupBuildAction();
    loadConfiguration();
    setupMobileNav();
});

// Setup Config Panels Tab Switch
function setupTabSwitching() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            const activeTab = btn.getAttribute('data-tab');
            document.getElementById(`${activeTab}-tab`).classList.remove('hidden');
        });
    });
}

// Bind Config inputs to UI State and Live Preview
function setupInputsBinding() {
    // App Name Bind
    elements.appNameInput.addEventListener('input', (e) => {
        config.appName = e.target.value.trim() || "اسم التطبيق";
        updateLivePreview();
        
        // Auto-generate package name slug if not manually edited
        if (!isPackageNameManuallyEdited) {
            let slug = config.appName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!slug || !/^[a-z]/.test(slug)) {
                slug = 'app_' + Math.random().toString(36).substr(2, 5);
            }
            const autoPackage = `com.example.webtoapp.${slug}`;
            elements.appPackageInput.value = autoPackage;
            config.appPackage = autoPackage;
        }
    });
    elements.appNameInput.addEventListener('change', () => {
        saveConfigToServer();
    });

    // Primary URL Bind
    elements.primaryUrlInput.addEventListener('input', (e) => {
        const urlValue = e.target.value.trim();
        config.primaryUrl = urlValue || "https://example.com";
        
        // Auto-extract domain to set favicon logo
        if (urlValue) {
            try {
                const formattedDomain = formatUrlRobust(urlValue);
                const urlObj = new URL(formattedDomain);
                const faviconUrl = `https://www.google.com/s2/favicons?sz=256&domain=${urlObj.hostname}`;
                
                // Overwrite only if empty or if it's an auto-generated favicon from a previous site
                if (!config.logoUrl || config.logoUrl.includes('google.com/s2/favicons')) {
                    config.logoUrl = faviconUrl;
                    elements.logoUrlInput.value = faviconUrl;
                }
            } catch (err) {
                // Ignore parsing errors while typing
            }
        }
        updateLivePreview();
    });
    elements.primaryUrlInput.addEventListener('change', (e) => {
        const val = formatUrlRobust(e.target.value);
        if (val) {
            e.target.value = val;
            config.primaryUrl = val;
            updateLivePreview();
        }
        saveConfigToServer();
    });

    // Logo URL Bind
    elements.logoUrlInput.addEventListener('input', (e) => {
        config.logoUrl = e.target.value.trim();
        updateLivePreview();
    });
    elements.logoUrlInput.addEventListener('change', () => {
        saveConfigToServer();
    });

    // App Icon Upload File Bind
    elements.iconUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('الرجاء اختيار ملف صورة صالح (PNG, JPG, WEBP)!');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة كبير جداً! الحد الأقصى هو 5 ميجابايت.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;
            
            logConsole("جاري رفع الأيقونة المخصصة إلى السيرفر...", "system-msg");
            
            try {
                const response = await fetch(`/api/upload-icon?sessionId=${sessionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ base64Data })
                });

                if (response.ok) {
                    const result = await response.json();
                    const fullIconUrl = window.location.origin + result.url;
                    
                    config.logoUrl = fullIconUrl;
                    elements.logoUrlInput.value = fullIconUrl;
                    
                    logConsole("تم رفع وتعيين أيقونة التطبيق بنجاح!", "success-msg");
                    updateLivePreview();
                    saveConfigToServer();
                } else {
                    const errResult = await response.json();
                    throw new Error(errResult.error || "خطأ غير معروف في السيرفر");
                }
            } catch (err) {
                logConsole(`فشل رفع أيقونة التطبيق: ${err.message}`, "error-msg");
                alert(`فشل رفع الأيقونة: ${err.message}`);
            }
        };

        reader.onerror = (err) => {
            console.error("FileReader Error:", err);
            alert("حدث خطأ أثناء قراءة ملف الصورة من جهازك.");
        };

        reader.readAsDataURL(file);
    });

    // Splash Screen Image URL Bind
    elements.splashImageUrlInput.addEventListener('input', (e) => {
        config.splashImageUrl = e.target.value.trim();
        updateLivePreview();
    });
    elements.splashImageUrlInput.addEventListener('change', () => {
        saveConfigToServer();
    });

    // Splash Screen Image Upload File Bind
    elements.splashUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            alert('الرجاء اختيار ملف صورة صالح (PNG, JPG, WEBP)!');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            alert('حجم الصورة كبير جداً! الحد الأقصى هو 5 ميجابايت.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result;

            logConsole("جاري رفع صورة شاشة البداية...", "system-msg");

            try {
                const response = await fetch(`/api/upload-icon?sessionId=${sessionId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ base64Data })
                });

                if (response.ok) {
                    const result = await response.json();
                    const fullUrl = window.location.origin + result.url;

                    config.splashImageUrl = fullUrl;
                    elements.splashImageUrlInput.value = fullUrl;

                    logConsole("تم رفع صورة شاشة البداية بنجاح!", "success-msg");
                    updateLivePreview();
                    saveConfigToServer();
                } else {
                    const errResult = await response.json();
                    throw new Error(errResult.error || "خطأ غير معروف في السيرفر");
                }
            } catch (err) {
                logConsole(`فشل رفع صورة شاشة البداية: ${err.message}`, "error-msg");
                alert(`فشل الرفع: ${err.message}`);
            }
        };

        reader.onerror = (err) => {
            console.error("FileReader Error:", err);
            alert("حدث خطأ أثناء قراءة ملف الصورة من جهازك.");
        };

        reader.readAsDataURL(file);
    });

    // App Package Bind
    elements.appPackageInput.addEventListener('input', (e) => {
        isPackageNameManuallyEdited = true;
        let val = e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
        e.target.value = val;
        config.appPackage = val || "com.example.webtoapp";
    });
    elements.appPackageInput.addEventListener('change', () => {
        saveConfigToServer();
    });

    // Theme Mode Bind
    elements.lightModeBtn.addEventListener('click', () => {
        elements.lightModeBtn.classList.add('active');
        elements.darkModeBtn.classList.remove('active');
        config.isDarkTheme = false;
        updateLivePreview();
        saveConfigToServer();
    });

    elements.darkModeBtn.addEventListener('click', () => {
        elements.darkModeBtn.classList.add('active');
        elements.lightModeBtn.classList.remove('active');
        config.isDarkTheme = true;
        updateLivePreview();
        saveConfigToServer();
    });

    // Advanced Settings Bind
    elements.enableZoomInput.addEventListener('change', (e) => {
        config.enableZoom = e.target.checked;
        saveConfigToServer();
    });

    elements.showProgressBarInput.addEventListener('change', (e) => {
        config.showProgressBar = e.target.checked;
        saveConfigToServer();
    });

    elements.userAgentInput.addEventListener('input', (e) => {
        config.userAgent = e.target.value.trim();
    });
    elements.userAgentInput.addEventListener('change', () => {
        saveConfigToServer();
    });
}

// Setup Theme Color palettes
function setupColorPalette() {
    elements.colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            elements.colorDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            
            const color = dot.getAttribute('data-color');
            config.themeColorHex = color;
            elements.customHexInput.value = color;
            updateLivePreview();
            saveConfigToServer();
        });
    });

    elements.customHexInput.addEventListener('input', (e) => {
        const hex = e.target.value.trim();
        // Simple hex validation regex
        if (/^#[0-9A-F]{6}$/i.test(hex)) {
            config.themeColorHex = hex;
            
            // Highlight matching dot if any
            elements.colorDots.forEach(dot => {
                if (dot.getAttribute('data-color').toLowerCase() === hex.toLowerCase()) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
            updateLivePreview();
        }
    });
    
    elements.customHexInput.addEventListener('change', () => {
        saveConfigToServer();
    });
}

// Setup Phone simulator Drawer interactions
function setupDrawerInteraction() {
    // Toggle Drawer Open
    elements.mockDrawerOpenBtn.addEventListener('click', () => {
        elements.mockDrawerElement.classList.add('active');
        elements.mockDrawerOverlay.classList.add('active');
    });

    // Close Drawer
    elements.mockDrawerOverlay.addEventListener('click', () => {
        elements.mockDrawerElement.classList.remove('active');
        elements.mockDrawerOverlay.classList.remove('active');
    });
}

// Load Configuration from server on load (with localStorage caching)
async function loadConfiguration() {
    try {
        const cached = localStorage.getItem(`app_config_${sessionId}`);
        if (cached) {
            config = JSON.parse(cached);
            console.log("Loaded configuration from browser localStorage.");
        } else {
            const response = await fetch(`/api/config?sessionId=${sessionId}`);
            if (response.ok) {
                config = await response.json();
                console.log("Loaded fallback configuration from server.");
            }
        }
        
        if (config) {
            config.sidebarItems = config.sidebarItems || [];
            
            // Populate inputs
            elements.appNameInput.value = config.appName || "";
            elements.primaryUrlInput.value = config.primaryUrl || "";
            elements.logoUrlInput.value = config.logoUrl || "";
            elements.splashImageUrlInput.value = config.splashImageUrl || "";
            elements.appPackageInput.value = config.appPackage || "com.example.webtoapp";
            elements.customHexInput.value = config.themeColorHex || "#2196F3";
            
            if (config.isDarkTheme) {
                elements.darkModeBtn.classList.add('active');
                elements.lightModeBtn.classList.remove('active');
            } else {
                elements.lightModeBtn.classList.add('active');
                elements.darkModeBtn.classList.remove('active');
            }
            
            // Populate color dot selection
            elements.colorDots.forEach(dot => {
                if (config.themeColorHex && dot.getAttribute('data-color').toLowerCase() === config.themeColorHex.toLowerCase()) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
            
            // Populate advanced inputs
            elements.enableZoomInput.checked = config.enableZoom !== false;
            elements.showProgressBarInput.checked = config.showProgressBar !== false;
            elements.userAgentInput.value = config.userAgent || "";
            
            updateLivePreview();
            renderSidebarItemsList();
            isPackageNameManuallyEdited = true;
        }
    } catch (e) {
        logConsole(`Error loading configuration: ${e.message}`, 'error-msg');
    }
}

// Update the phone mockup simulator display
function updateLivePreview() {
    // App Name Branding
    elements.mockAppTitle.textContent = activePageId ? getPageTitle(activePageId) : (config.appName || "اسم التطبيق");
    if (elements.mockDrawerTitle) {
        elements.mockDrawerTitle.textContent = config.appName || "اسم التطبيق";
    }

    // Set CSS theme colors
    document.documentElement.style.setProperty('--primary-color', config.themeColorHex);
    // Convert hex to rgb for rgba box shadow transparency effects
    const rgb = hexToRgb(config.themeColorHex);
    if (rgb) {
        document.documentElement.style.setProperty('--primary-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
    }

    // Dark/Light Theme class toggling
    if (config.isDarkTheme) {
        elements.phoneScreen.classList.add('dark-theme-active');
    } else {
        elements.phoneScreen.classList.remove('dark-theme-active');
    }

    // Update Simulated Content Area
    renderMockContent();
    renderMockDrawerNav();
}

// Render dynamic navigation menu in mock drawer
function renderMockDrawerNav() {
    elements.mockDrawerNav.innerHTML = '';
    
    // Add Home / الرئيسية item
    const homeItem = document.createElement('div');
    homeItem.className = `drawer-menu-item ${activePageId === null ? 'active' : ''}`;
    homeItem.innerHTML = `<i class="fa-solid fa-house"></i> <span>الرئيسية</span>`;
    homeItem.addEventListener('click', () => {
        activePageId = null;
        updateLivePreview();
        closeMockDrawer();
    });
    elements.mockDrawerNav.appendChild(homeItem);
    
    // Custom items
    config.sidebarItems.forEach(item => {
        const menuItem = document.createElement('div');
        menuItem.className = `drawer-menu-item ${activePageId === item.id ? 'active' : ''}`;
        menuItem.innerHTML = `<i class="${getFaIcon(item.iconName)}"></i> <span>${item.title}</span>`;
        menuItem.addEventListener('click', () => {
            activePageId = item.id;
            updateLivePreview();
            closeMockDrawer();
        });
        elements.mockDrawerNav.appendChild(menuItem);
    });
}

// Render content in mock phone screen (Webpage placeholder or Custom HTML)
function renderMockContent() {
    elements.mockWebviewContainer.innerHTML = '';
    
    if (activePageId === null) {
        // Main URL screen
        let url = config.primaryUrl ? config.primaryUrl.trim() : "";
        if (url && !/^https?:\/\//i.test(url)) {
            url = "https://" + url;
        }
        elements.mockWebviewUrl.textContent = url || "https://example.com";
        document.getElementById('mock-webview-address-bar').style.display = 'flex';
        
        if (url) {
            elements.mockWebviewContainer.innerHTML = `
                <iframe src="/api/proxy?url=${encodeURIComponent(url)}" style="width: 100%; height: 100%; border: none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
            `;
        } else {
            elements.mockWebviewContainer.innerHTML = `
                <div class="iframe-placeholder" style="padding: 16px;">
                    <i class="fa-solid fa-globe icon-globe" style="color: var(--primary-color);"></i>
                    <p>أدخل رابط موقع صالح للتحميل...</p>
                </div>
            `;
        }
    } else {
        const activeItem = config.sidebarItems.find(i => i.id === activePageId);
        if (activeItem) {
            if (activeItem.type === 'WEB_URL') {
                let url = activeItem.urlOrContent ? activeItem.urlOrContent.trim() : "";
                if (url && !/^https?:\/\//i.test(url)) {
                    url = "https://" + url;
                }
                elements.mockWebviewUrl.textContent = url || "https://example.com";
                document.getElementById('mock-webview-address-bar').style.display = 'flex';
                
                if (url) {
                    elements.mockWebviewContainer.innerHTML = `
                        <iframe src="/api/proxy?url=${encodeURIComponent(url)}" style="width: 100%; height: 100%; border: none;" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
                    `;
                } else {
                    elements.mockWebviewContainer.innerHTML = `
                        <div class="iframe-placeholder" style="padding: 16px;">
                            <i class="fa-solid fa-link icon-globe" style="color: var(--primary-color);"></i>
                            <p>أدخل رابط صفحة صالح للتحميل...</p>
                        </div>
                    `;
                }
            } else {
                // Custom HTML Page Preview
                document.getElementById('mock-webview-address-bar').style.display = 'none';
                
                // Inject custom HTML preview frame
                const htmlPreview = document.createElement('div');
                htmlPreview.className = 'custom-html-preview';
                
                // Strip HTML wrapper tags to display text/body nicely inside mockup or use iframe sandbox
                htmlPreview.innerHTML = activeItem.urlOrContent;
                elements.mockWebviewContainer.appendChild(htmlPreview);
            }
        }
    }
}

// Helper to close preview drawer
function closeMockDrawer() {
    elements.mockDrawerElement.classList.remove('active');
    elements.mockDrawerOverlay.classList.remove('active');
}

// Get Page title for Header display
function getPageTitle(id) {
    const item = config.sidebarItems.find(i => i.id === id);
    return item ? item.title : config.appName;
}

// Render config list card elements for Pages manager tab
function renderSidebarItemsList() {
    elements.sidebarItemsContainer.innerHTML = '';
    
    config.sidebarItems.forEach(item => {
        const card = document.createElement('div');
        card.className = 'sidebar-item-card';
        card.innerHTML = `
            <div class="item-info">
                <i class="${getFaIcon(item.iconName)}"></i>
                <div class="item-details">
                    <h4>${item.title}</h4>
                    <span>${item.type === 'WEB_URL' ? 'رابط خارجي' : 'صفحة HTML مخصصة'}</span>
                </div>
            </div>
            <div class="item-actions">
                <button class="icon-btn-secondary edit-item-btn" data-id="${item.id}" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-btn-danger delete-item-btn" data-id="${item.id}" title="حذف"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        
        // Edit action
        card.querySelector('.edit-item-btn').addEventListener('click', () => {
            openPageModal('edit', item.id);
        });

        // Delete action
        card.querySelector('.delete-item-btn').addEventListener('click', () => {
            config.sidebarItems = config.sidebarItems.filter(i => i.id !== item.id);
            if (activePageId === item.id) {
                activePageId = null;
            }
            updateLivePreview();
            renderSidebarItemsList();
            saveConfigToServer();
        });

        elements.sidebarItemsContainer.appendChild(card);
    });
}

// Setup dialog events for Adding/Editing pages
function setupModalEvents() {
    elements.addPageBtn.addEventListener('click', () => openPageModal('add'));
    elements.closeModalX.addEventListener('click', closePageModal);
    elements.cancelModalBtn.addEventListener('click', closePageModal);
    
    // Page Type toggle change inputs
    elements.radioPageTypes.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'WEB_URL') {
                elements.urlInputWrapper.classList.remove('hidden');
                elements.htmlInputWrapper.classList.add('hidden');
            } else {
                elements.urlInputWrapper.classList.add('hidden');
                elements.htmlInputWrapper.classList.remove('hidden');
            }
        });
    });

    // Icon Selector grid click
    elements.iconSelectItems.forEach(item => {
        item.addEventListener('click', () => {
            elements.iconSelectItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            selectedModalIcon = item.getAttribute('data-icon');
        });
    });

    // Save item Click
    elements.savePageBtn.addEventListener('click', savePageItem);
}

// Open modal form
function openPageModal(mode, itemId = null) {
    modalMode = mode;
    editingItemId = itemId;
    
    // Reset Form
    elements.modalPageTitle.value = '';
    elements.modalPageUrl.value = '';
    elements.modalPageHtml.value = '';
    
    elements.radioPageTypes[0].checked = true; // default URL
    elements.urlInputWrapper.classList.remove('hidden');
    elements.htmlInputWrapper.classList.add('hidden');
    
    elements.iconSelectItems.forEach(i => i.classList.remove('active'));
    elements.iconSelectItems[2].classList.add('active'); // default Link icon
    selectedModalIcon = 'Link';

    if (mode === 'add') {
        elements.modalTitleText.textContent = "إضافة صفحة قائمة جانبية جديدة";
    } else {
        elements.modalTitleText.textContent = "تعديل بيانات الصفحة";
        const item = config.sidebarItems.find(i => i.id === itemId);
        if (item) {
            elements.modalPageTitle.value = item.title;
            if (item.type === 'WEB_URL') {
                elements.radioPageTypes[0].checked = true;
                elements.modalPageUrl.value = item.urlOrContent;
                elements.urlInputWrapper.classList.remove('hidden');
                elements.htmlInputWrapper.classList.add('hidden');
            } else {
                elements.radioPageTypes[1].checked = true;
                elements.modalPageHtml.value = item.urlOrContent;
                elements.urlInputWrapper.classList.add('hidden');
                elements.htmlInputWrapper.classList.remove('hidden');
            }
            
            // Preselect Icon
            elements.iconSelectItems.forEach(i => {
                if (i.getAttribute('data-icon') === item.iconName) {
                    i.classList.add('active');
                    selectedModalIcon = item.iconName;
                } else {
                    i.classList.remove('active');
                }
            });
        }
    }
    
    elements.pageModal.classList.remove('hidden');
}

// Close modal form
function closePageModal() {
    elements.pageModal.classList.add('hidden');
}

// Robust URL validation and formatting
function formatUrlRobust(url) {
    if (!url) return "";
    let formatted = url.trim().replace(/\s+/g, "");
    if (!formatted) return "";
    
    // Auto prepend scheme if missing
    if (!/^https?:\/\//i.test(formatted)) {
        formatted = "https://" + formatted;
    }
    
    // Auto append TLD (.com) if domain part has no dot
    const domainPart = formatted.replace(/^https?:\/\//i, "");
    if (!domainPart.includes(".")) {
        formatted = formatted + ".com";
    }
    
    return formatted;
}

// Save/edit sidebar pages
function savePageItem() {
    const title = elements.modalPageTitle.value.trim();
    const type = document.querySelector('input[name="page-type"]:checked').value;
    let urlOrContent = type === 'WEB_URL' ? elements.modalPageUrl.value.trim() : elements.modalPageHtml.value.trim();
    
    if (!title || !urlOrContent) {
        alert("يرجى ملء جميع الحقول المطلوبة!");
        return;
    }

    if (type === 'WEB_URL') {
        urlOrContent = formatUrlRobust(urlOrContent);
    }

    if (modalMode === 'add') {
        const newItem = {
            id: 'page_' + Math.random().toString(36).substr(2, 9),
            title,
            type,
            urlOrContent,
            iconName: selectedModalIcon
        };
        config.sidebarItems.push(newItem);
    } else {
        config.sidebarItems = config.sidebarItems.map(item => {
            if (item.id === editingItemId) {
                return { ...item, title, type, urlOrContent, iconName: selectedModalIcon };
            }
            return item;
        });
    }

    updateLivePreview();
    renderSidebarItemsList();
    closePageModal();
    saveConfigToServer();
}

// Save config payload to server automatically and locally
async function saveConfigToServer() {
    try {
        localStorage.setItem(`app_config_${sessionId}`, JSON.stringify(config));
        const response = await fetch(`/api/config?sessionId=${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (!response.ok) {
            console.error("Failed to auto-save config to server.");
        }
    } catch (e) {
        console.error("Error auto-saving config:", e);
    }
}

// Save config payload and start build compilation process
function setupBuildAction() {
    elements.generateApkBtn.addEventListener('click', async () => {
        // Step 1: Save Configuration
        logConsole("Saving app configuration to project assets...", 'system-msg');
        elements.generateApkBtn.disabled = true;
        elements.apkDownloadContainer.innerHTML = '';
        
        try {
            localStorage.setItem(`app_config_${sessionId}`, JSON.stringify(config));
            const saveRes = await fetch(`/api/config?sessionId=${sessionId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            if (!saveRes.ok) {
                throw new Error("Failed to save config file");
            }
            
            logConsole("Configuration saved successfully! Initiating Gradle compiler...", 'success-msg');
            
            // Progress Bar animation setup
            let progress = 0;
            let progressInterval = null;
            
            const startProgress = () => {
                elements.buildProgressContainer.classList.remove('hidden');
                elements.buildProgressBar.style.width = '0%';
                elements.buildProgressText.textContent = '0%';
                progress = 0;
                
                progressInterval = setInterval(() => {
                    if (progress < 90) {
                        const increment = Math.max(0.5, (90 - progress) / 30);
                        progress += increment;
                        const displayProgress = Math.min(90, Math.floor(progress));
                        elements.buildProgressBar.style.width = `${displayProgress}%`;
                        elements.buildProgressText.textContent = `${displayProgress}%`;
                    }
                }, 800);
            };
            
            const completeProgress = (success) => {
                if (progressInterval) clearInterval(progressInterval);
                if (success) {
                    elements.buildProgressBar.style.width = '100%';
                    elements.buildProgressText.textContent = '100%';
                    setTimeout(() => {
                        elements.buildProgressContainer.classList.add('hidden');
                    }, 3000);
                } else {
                    elements.buildProgressBar.style.width = '0%';
                    elements.buildProgressText.textContent = '0%';
                    elements.buildProgressContainer.classList.add('hidden');
                }
            };

            // Step 2: Trigger build command passing config directly to isolate users
            const buildRes = await fetch(`/api/build?sessionId=${sessionId}`, { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ config: config })
            });
            if (!buildRes.ok) {
                throw new Error("Failed to start Gradle build");
            }
            
            updateBuildStatus('building');
            startProgress();
            
            // Auto switch to console tab on mobile so logs can be monitored
            const consoleTabBtn = document.querySelector('.mobile-nav-btn[data-target="console"]');
            if (consoleTabBtn && window.innerWidth <= 1024) {
                consoleTabBtn.click();
            }
            
            // Step 3: Listen to event source logs in real-time
            const eventSource = new EventSource(`/api/build/logs?sessionId=${sessionId}`);
            
            eventSource.onmessage = (e) => {
                const data = JSON.parse(e.data);
                
                if (data.log === "STREAM_END") {
                    eventSource.close();
                    updateBuildStatus(data.status);
                    elements.generateApkBtn.disabled = false;
                    
                    if (data.status === 'success') {
                        completeProgress(true);
                        logConsole(`🎉 App built successfully!`, 'success-msg');
                        logConsole(`📦 Package Name (اسم الحزمة): ${data.appId}`, 'success-msg');
                        logConsole(`Output APK Link: ${data.apkName}`, 'success-msg');
                        renderApkDownloadButton(data.apkName, data.appId);
                    } else {
                        completeProgress(false);
                        logConsole("❌ Compilation failed! Please review the terminal logs above.", 'error-msg');
                    }
                    return;
                }
                
                // Print logs in terminal window
                if (data.log.startsWith('[ERROR]')) {
                    logConsole(data.log, 'error-msg');
                } else {
                    logConsole(data.log);
                }
            };
            
            eventSource.onerror = (err) => {
                eventSource.close();
                completeProgress(false);
                logConsole("EventSource connection lost.", 'error-msg');
                elements.generateApkBtn.disabled = false;
                updateBuildStatus('failed');
            };
            
        } catch (err) {
            logConsole(`Error: ${err.message}`, 'error-msg');
            elements.generateApkBtn.disabled = false;
            updateBuildStatus('failed');
        }
    });

    // Preview Interactive App Action
    elements.previewAppBtn.addEventListener('click', () => {
        // Open window immediately to bypass popup blocker
        const previewWindow = window.open('about:blank', '_blank');
        if (previewWindow) {
            previewWindow.document.write('<div style="font-family:sans-serif; text-align:center; padding-top:50px;"><h2>جاري تحميل المعاينة...</h2><p>يتم حفظ الإعدادات الحالية أولاً.</p></div>');
        }

        logConsole("Saving app configuration for live preview...", 'system-msg');
        
        // Ensure primaryUrl starts with http
        if (config.primaryUrl && !/^https?:\/\//i.test(config.primaryUrl)) {
            config.primaryUrl = 'https://' + config.primaryUrl;
            elements.primaryUrlInput.value = config.primaryUrl;
        }

        fetch(`/api/config?sessionId=${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        })
        .then(saveRes => {
            if (saveRes.ok) {
                logConsole("Configuration saved. Opening interactive live preview...", 'success-msg');
                if (previewWindow) {
                    previewWindow.location.href = '/preview.html';
                }
            } else {
                if (previewWindow) previewWindow.close();
                throw new Error("Failed to save temporary preview configuration");
            }
        })
        .catch(err => {
            if (previewWindow) previewWindow.close();
            logConsole(`Error opening preview: ${err.message}`, 'error-msg');
            alert(`حدث خطأ أثناء فتح المعاينة: ${err.message}`);
        });
    });

    // Clear logs screen
    elements.clearConsoleBtn.addEventListener('click', () => {
        elements.consoleOutputContainer.innerHTML = '';
        logConsole("Terminal cleared.");
    });
}

// Utility to append console log lines
function logConsole(message, className = '') {
    const line = document.createElement('div');
    line.className = `console-line ${className}`;
    line.textContent = message.startsWith('>') ? message : `> ${message}`;
    elements.consoleOutputContainer.appendChild(line);
    elements.consoleOutputContainer.scrollTop = elements.consoleOutputContainer.scrollHeight;
}

// Utility to update build status indicators
function updateBuildStatus(status) {
    elements.buildStatusIndicator.className = `build-status-indicator ${status}`;
    elements.consoleStatusBadge.className = `badge ${status}`;
    elements.consoleStatusBadge.textContent = status;
    
    let ArabicStatusText = 'جاهز للتجميع';
    if (status === 'building') {
        ArabicStatusText = 'جاري تجميع الكود وتصدير الـ APK...';
    } else if (status === 'success') {
        ArabicStatusText = 'تم تجميع الـ APK بنجاح!';
    } else if (status === 'failed') {
        ArabicStatusText = 'فشل البناء! تحقق من الأخطاء';
    }
    elements.buildStatusIndicator.innerHTML = `<i class="fa-solid ${getIndicatorIcon(status)}"></i> ${ArabicStatusText}`;
}

// Premium client-side file downloader to bypass AWS S3 default filename and rename to original Arabic name
async function downloadFileWithCustomName(url, defaultName) {
    const btn = document.getElementById('download-btn');
    const originalHtml = btn ? btn.innerHTML : '';
    
    try {
        logConsole("جاري تنزيل التطبيق بالاسم الأصلي في الخلفية، يرجى الانتظار...", 'system-msg');
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> جاري التحضير...`;
        }
        
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to download file");
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
        
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        logConsole("🎉 اكتمل تحميل التطبيق بنجاح بالاسم الأصلي المخصص!", 'success-msg');
    } catch (e) {
        console.error("Custom download failed, falling back to direct redirect:", e);
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        window.open(url, '_blank');
    }
}

// Render final APK Download Button
function renderApkDownloadButton(filename, appId) {
    const downloadHref = (filename.startsWith('http') || filename.startsWith('/')) ? filename : `/builds/${filename}`;
    
    // Extract actual app name from config or use a fallback
    const appName = config.appName ? `${config.appName}.apk` : 'app.apk';
    
    elements.apkDownloadContainer.innerHTML = `
        <div style="width: 100%; display: flex; flex-direction: column; gap: 8px;">
            <div style="background: rgba(16, 185, 129, 0.1); border: 1px dashed var(--success-color); border-radius: 6px; padding: 10px; text-align: center; font-size: 11px; color: var(--text-muted);">
                اسم حزمة التطبيق المولد (Package Name):<br>
                <code style="color: var(--success-color); font-weight: bold; font-family: monospace; font-size: 12px; margin-top: 4px; display: inline-block;">${appId}</code>
            </div>
            <button id="download-btn" class="btn-download animate-pulse" style="border: none; cursor: pointer; width: 100%;">
                <i class="fa-solid fa-circle-down"></i>
                تحميل ملف الـ APK المجمّع
            </button>
        </div>
    `;
    
    document.getElementById('download-btn').addEventListener('click', () => {
        downloadFileWithCustomName(downloadHref, appName);
    });
}

// Icons Helper mappings
function getFaIcon(iconName) {
    switch (iconName) {
        case 'Home': return 'fa-solid fa-house';
        case 'Info': return 'fa-solid fa-circle-info';
        case 'Link': return 'fa-solid fa-link';
        case 'Settings': return 'fa-solid fa-gears';
        case 'Document': return 'fa-solid fa-file-invoice';
        case 'Star': return 'fa-solid fa-star';
        case 'Person': return 'fa-solid fa-user';
        default: return 'fa-solid fa-globe';
    }
}

function getIndicatorIcon(status) {
    if (status === 'building') return 'fa-solid fa-spinner fa-spin';
    if (status === 'success') return 'fa-solid fa-circle-check';
    if (status === 'failed') return 'fa-solid fa-circle-xmark';
    return 'fa-solid fa-circle-info';
}

// Color Utility hex parsing
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

// Mobile navigation handling for responsive view
function setupMobileNav() {
    const navBar = document.querySelector('.mobile-nav-bar');
    if (!navBar) return;
    
    const container = document.querySelector('.app-container');
    const buttons = navBar.querySelectorAll('.mobile-nav-btn');
    
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            container.classList.remove('show-config', 'show-preview', 'show-console');
            const target = btn.getAttribute('data-target');
            container.classList.add(`show-${target}`);
        });
    });
}
