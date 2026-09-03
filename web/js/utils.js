// ============================================
// Utility Functions
// ============================================

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return size.toFixed(1) + ' ' + units[i];
}

function formatTime(seconds) {
    if (seconds < 60) return '~' + Math.round(seconds) + 's';
    if (seconds < 3600) return '~' + Math.floor(seconds / 60) + 'm';
    return '~' + Math.floor(seconds / 3600) + 'h';
}

function getStatusIcon(status) {
    var icons = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️',
    };
    return icons[status] || '●';
}

function getStatusClass(status) {
    var classes = {
        success: 'success',
        warning: 'warning',
        error: 'error',
        info: 'info',
        ok: 'success',
        skip: 'warning',
    };
    return classes[status] || 'info';
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function t(key) {
    // Return a translated string, falling back to the key itself
    return (State.strings && State.strings[key]) || key;
}

function now() {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Persian/Jalali Date Conversion
function toPersianDate(date) {
    // Simple approximation for Jalali date
    // For production, use a proper Jalali library
    var gy = date.getFullYear();
    var gm = date.getMonth() + 1;
    var gd = date.getDate();
    
    // Simple algorithm for converting Gregorian to Jalali
    var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var days = 355666 + (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g_d_m[gm - 1];
    var jy = -1595 + (33 * Math.floor(days / 12053));
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    var jm, jd;
    if (days < 186) {
        jm = 1 + Math.floor(days / 31);
        jd = 1 + (days % 31);
    } else {
        jm = 7 + Math.floor((days - 186) / 30);
        jd = 1 + ((days - 186) % 30);
    }
    
    return jy + '/' + (jm < 10 ? '0' : '') + jm + '/' + (jd < 10 ? '0' : '') + jd;
}

function formatDate(date, lang) {
    if (lang === 'fa') {
        return toPersianDate(date);
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
