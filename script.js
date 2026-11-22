// Change this with: python3 set_password.py
const PASSWORD_HASH = "a14aadfc0d2aec5e8af2c902b76dd0c4a37463f718b8767b7ae9a2cc990e3200";
const SESSION_KEY = "multitool-open";
const PORT_KEY = "multitool-port";

let toolsReady = false;
let lookedUpUrl = "";
let working = false;
let helperConnected = false;
let helperAttempt = 0;
let helperWatch = 0;
let helperQuietTicks = 0;
let helperPause = false;
let helperChecking = false;

function sha256Hex(text) {
    const bytes = new TextEncoder().encode(text);
    const bitLength = bytes.length * 8;
    const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6;
    const padded = new Uint8Array(paddedLength);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(paddedLength - 4, bitLength >>> 0, false);

    const k = new Uint32Array([
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
    ]);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    for (let offset = 0; offset < paddedLength; offset += 64) {
        for (let i = 0; i < 16; i += 1) {
            w[i] = view.getUint32(offset + i * 4, false);
        }
        for (let i = 16; i < 64; i += 1) {
            const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
            const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }

        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;

        for (let i = 0; i < 64; i += 1) {
            const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const temp1 = (h + s1 + ch + k[i] + w[i]) >>> 0;
            const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const temp2 = (s0 + maj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }

        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    return [h0, h1, h2, h3, h4, h5, h6, h7]
        .map((part) => part.toString(16).padStart(8, "0"))
        .join("");

    function rotr(value, amount) {
        return ((value >>> amount) | (value << (32 - amount))) >>> 0;
    }
}

function sameText(left, right) {
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i += 1) {
        diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
}

function startSnow() {
    const snow = document.querySelector("#snow");

    for (let i = 0; i < 300; i += 1) {
        const flake = document.createElement("li");
        flake.style.left = `${Math.random() * 100}%`;
        flake.style.width = `${2 + Math.random() * 10}px`;
        flake.style.height = flake.style.width;
        const fallDuration = 20 + Math.random() * 20;
        flake.style.setProperty("--fall-duration", `${fallDuration}s`);
        flake.style.setProperty("--fall-delay", `-${Math.random() * fallDuration}s`);
        flake.style.setProperty("--fall-drift", `${Math.random() * 100 - 50}px`);
        const swayDistance = 4 + Math.random() * 16;
        flake.style.setProperty("--sway-left", `-${swayDistance}px`);
        flake.style.setProperty("--sway-right", `${swayDistance}px`);
        flake.style.setProperty("--sway-duration", `${2 + Math.random() * 5}s`);
        flake.style.setProperty("--sway-delay", `-${Math.random() * 5}s`);
        snow.append(flake);

        flake.addEventListener("animationiteration", (event) => {
            if (event.animationName !== "snowfall") return;
            flake.style.left = `${Math.random() * 100}%`;
            flake.style.setProperty("--fall-drift", `${Math.random() * 100 - 50}px`);
        });
    }
}

function setupGate() {
    const form = document.querySelector("#lock-form");
    const message = document.querySelector("#lock-message");

    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const password = document.querySelector("#password").value;
        if (!password) {
            message.textContent = "Enter the password.";
            return;
        }
        if (!sameText(sha256Hex(password), PASSWORD_HASH)) {
            message.textContent = "That password is wrong.";
            return;
        }
        message.textContent = "";
        sessionStorage.setItem(SESSION_KEY, "yes");
        openTools();
    });

    document.querySelector("#lock").addEventListener("click", () => {
        sessionStorage.removeItem(SESSION_KEY);
        stopHelperWatch();
        document.querySelector("#password").value = "";
        document.querySelector("#tools").hidden = true;
        document.querySelector("#gate").hidden = false;
        document.querySelector("#password").focus();
    });
}

function openTools() {
    document.querySelector("#gate").hidden = true;
    document.querySelector("#tools").hidden = false;
    if (!toolsReady) {
        toolsReady = true;
        setupVideo();
        setupQr();
    }
    watchHelper();
}

function currentPort() {
    const saved = localStorage.getItem(PORT_KEY) || document.querySelector("#port").value;
    const port = Number(saved);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return 8765;
    return port;
}

function helperAddress(path) {
    return `http://127.0.0.1:${currentPort()}${path}`;
}

function unreachableMessage() {
    return `Can't reach the helper at 127.0.0.1:${currentPort()}. Start helper/server.py on this computer, the same one as this browser, and leave that window open. If the browser asks to connect to apps on this device, choose Allow.`;
}

function pageIsLoopback() {
    const host = location.hostname.replace(/^\[|\]$/g, "");
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function loopbackPermission() {
    if (!navigator.permissions || !navigator.permissions.query) return "unknown";
    try {
        const status = await navigator.permissions.query({ name: "loopback-network" });
        return status.state;
    } catch (error) {
        return "unknown";
    }
}

function promptMessage() {
    return `Can't reach the helper at 127.0.0.1:${currentPort()}. Click Check again, and when the browser asks to connect to apps on this device, choose Allow.`;
}

function deniedMessage() {
    return `Can't reach the helper at 127.0.0.1:${currentPort()}. Chrome blocked apps on this device for this site. Click the lock icon in the address bar, set Apps on device to Allow, then click Check again.`;
}

async function failureStatus() {
    const where = `127.0.0.1:${currentPort()}`;
    if (location.protocol === "file:") {
        helperPause = true;
        return `Can't reach the helper at ${where}. Open this page from https://manofneptune27.github.io/Multitool/ or from http://127.0.0.1. A file opened from the folder cannot talk to the helper.`;
    }
    if (pageIsLoopback()) {
        helperPause = false;
        return unreachableMessage();
    }
    const state = await loopbackPermission();
    if (state === "denied") {
        helperPause = true;
        return deniedMessage();
    }
    if (state === "prompt") {
        helperPause = true;
        return promptMessage();
    }
    helperPause = false;
    return unreachableMessage();
}

async function helperFetch(path, options) {
    const base = Object.assign({ cache: "no-store" }, options || {});
    try {
        return await fetch(helperAddress(path), Object.assign({ targetAddressSpace: "loopback" }, base));
    } catch (error) {
        const detail = String(error && error.message || "").toLowerCase();
        if (!detail.includes("targetaddressspace")) throw error;
        return fetch(helperAddress(path), base);
    }
}

async function readError(response) {
    try {
        const data = await response.json();
        if (data && data.error) return data.error;
    } catch (error) {
        return "The helper could not do that.";
    }
    return "The helper could not do that.";
}

function setHelperStatus(text, isError) {
    const status = document.querySelector("#helper-status");
    status.textContent = text;
    status.className = isError ? "error" : "status";
}

function watchHelper() {
    checkHelper();
    if (helperWatch) return;
    helperWatch = setInterval(() => {
        if (document.querySelector("#tools").hidden) return;
        if (helperPause) return;
        if (helperConnected) {
            helperQuietTicks += 1;
            if (helperQuietTicks < 8) return;
        }
        helperQuietTicks = 0;
        checkHelper();
    }, 4000);
    document.addEventListener("visibilitychange", checkWhenVisible);
}

function stopHelperWatch() {
    if (helperWatch) clearInterval(helperWatch);
    helperWatch = 0;
    helperConnected = false;
    helperPause = false;
    helperChecking = false;
    helperQuietTicks = 0;
    document.removeEventListener("visibilitychange", checkWhenVisible);
}

function checkWhenVisible() {
    if (document.visibilityState !== "visible") return;
    if (document.querySelector("#tools").hidden) return;
    helperQuietTicks = 0;
    checkHelper();
}

async function checkHelper() {
    if (helperChecking) return;
    const gesture = !!(navigator.userActivation && navigator.userActivation.isActive);
    helperChecking = true;
    const attempt = ++helperAttempt;
    try {
        if (!gesture && !pageIsLoopback() && location.protocol !== "file:") {
            const state = await loopbackPermission();
            if (attempt !== helperAttempt) return;
            if (state === "prompt" || state === "denied") {
                helperConnected = false;
                helperPause = true;
                setHelperStatus(state === "denied" ? deniedMessage() : promptMessage(), true);
                return;
            }
        }
        const response = await helperFetch("/health");
        if (attempt !== helperAttempt) return;
        if (!response.ok) {
            helperConnected = false;
            helperPause = false;
            setHelperStatus(await readError(response), true);
            return;
        }
        const data = await response.json();
        if (attempt !== helperAttempt) return;
        helperPause = false;
        if (!data.ytdlp) {
            helperConnected = true;
            setHelperStatus("The helper is running, but yt-dlp is not installed. Run python3 -m pip install --user yt-dlp and check again.", true);
            return;
        }
        helperConnected = true;
        const ffmpegNote = data.ffmpeg ? "" : " ffmpeg is not installed, so a saved video may have no sound.";
        setHelperStatus(`Helper is running (yt-dlp ${data.ytdlp}).${ffmpegNote}`, false);
    } catch (error) {
        if (attempt !== helperAttempt) return;
        helperConnected = false;
        const status = await failureStatus();
        if (attempt !== helperAttempt) return;
        setHelperStatus(status, true);
    } finally {
        helperChecking = false;
    }
}

function formatDuration(seconds) {
    if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remain = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
    return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function formatSize(bytes) {
    if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return "";
    let size = bytes;
    const units = ["B", "KB", "MB", "GB"];
    let unit = units[0];
    for (let i = 0; i < units.length; i += 1) {
        unit = units[i];
        if (size < 1024 || unit === "GB") break;
        size /= 1024;
    }
    const shown = unit === "B" ? String(Math.round(size)) : size.toFixed(1);
    return `${shown} ${unit}`;
}

function safeImage(url) {
    if (typeof url !== "string") return "";
    try {
        const parsed = new URL(url);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") return parsed.href;
    } catch (error) {
        return "";
    }
    return "";
}

function filenameFromDisposition(header) {
    if (!header) return "download";
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
    if (encoded) return decodeURIComponent(encoded[1]);
    const plain = /filename="([^"]+)"/i.exec(header);
    return plain ? plain[1] : "download";
}

function saveBlob(blob, name) {
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    link.href = objectUrl;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
}

function showResult(info) {
    const box = document.querySelector("#video-result");
    box.replaceChildren();

    const title = document.createElement("h3");
    title.textContent = info.title || "Untitled";
    box.append(title);

    const imageUrl = safeImage(info.thumbnail);
    if (imageUrl) {
        const image = document.createElement("img");
        image.className = "thumb";
        image.alt = "";
        image.referrerPolicy = "no-referrer";
        image.src = imageUrl;
        box.append(image);
    }

    const meta = document.createElement("p");
    meta.className = "meta";
    const bits = [info.site, formatDuration(info.duration), formatSize(info.filesize)].filter(Boolean);
    if (info.kind === "playlist" && info.count) bits.push(`${info.count} files`);
    meta.textContent = bits.join(" · ");
    box.append(meta);

    const row = document.createElement("div");
    row.className = "row";
    const primary = document.createElement("button");
    primary.type = "button";
    if (info.kind === "audio") {
        primary.textContent = "Save audio";
        primary.addEventListener("click", () => saveMedia("audio"));
    } else if (info.kind === "image") {
        primary.textContent = "Save image";
        primary.addEventListener("click", () => saveMedia("video"));
    } else {
        primary.textContent = info.kind === "playlist" ? "Save files" : "Save video";
        primary.addEventListener("click", () => saveMedia("video"));
    }
    row.append(primary);

    if (info.kind === "video") {
        const audio = document.createElement("button");
        audio.type = "button";
        audio.textContent = "Save audio";
        audio.addEventListener("click", () => saveMedia("audio"));
        row.append(audio);
    }
    box.append(row);

    const message = document.createElement("p");
    message.id = "save-message";
    message.className = "status";
    message.setAttribute("role", "status");
    box.append(message);
}

function setupVideo() {
    const portInput = document.querySelector("#port");
    portInput.value = String(currentPort());

    portInput.addEventListener("change", () => {
        const port = Number(portInput.value);
        const next = Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 8765;
        portInput.value = String(next);
        localStorage.setItem(PORT_KEY, String(next));
        helperConnected = false;
        helperQuietTicks = 0;
        checkHelper();
    });

    document.querySelector("#recheck").addEventListener("click", checkHelper);

    document.querySelector("#lookup-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        if (working) return;
        const url = document.querySelector("#video-url").value.trim();
        const button = document.querySelector("#lookup");
        lookedUpUrl = "";
        document.querySelector("#video-result").replaceChildren();
        working = true;
        button.disabled = true;
        setHelperStatus("Looking up that link…", false);
        try {
            const response = await helperFetch("/info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url })
            });
            if (!response.ok) {
                setHelperStatus(await readError(response), true);
                return;
            }
            const info = await response.json();
            lookedUpUrl = url;
            showResult(info);
            const ffmpegNote = info.ffmpeg ? "" : " ffmpeg is not installed, so a saved video may have no sound.";
            setHelperStatus(`Found it.${ffmpegNote}`, false);
        } catch (error) {
            setHelperStatus(unreachableMessage(), true);
        } finally {
            working = false;
            button.disabled = false;
        }
    });
}

async function saveMedia(mode) {
    const url = document.querySelector("#video-url").value.trim();
    const message = document.querySelector("#save-message");
    if (url !== lookedUpUrl) {
        if (message) {
            message.textContent = "Look up that link first.";
            message.className = "error";
        }
        return;
    }
    if (working) return;
    working = true;
    if (message) {
        message.textContent = "Saving…";
        message.className = "status";
    }
    try {
        const response = await helperFetch("/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, mode })
        });
        if (!response.ok) {
            if (message) {
                message.textContent = await readError(response);
                message.className = "error";
            }
            return;
        }
        const blob = await response.blob();
        saveBlob(blob, filenameFromDisposition(response.headers.get("Content-Disposition")));
        if (message) {
            message.textContent = "Saved through your browser.";
            message.className = "status";
        }
    } catch (error) {
        if (message) {
            message.textContent = unreachableMessage();
            message.className = "error";
        }
    } finally {
        working = false;
    }
}

function drawQr(text) {
    const canvas = document.querySelector("#qr-canvas");
    const message = document.querySelector("#qr-message");
    const save = document.querySelector("#save-qr");
    if (!text) {
        canvas.hidden = true;
        save.disabled = true;
        message.textContent = "";
        return;
    }
    if (typeof qrcodegen === "undefined") {
        canvas.hidden = true;
        save.disabled = true;
        message.textContent = "The QR code library did not load.";
        return;
    }
    let qr;
    try {
        qr = qrcodegen.QrCode.encodeText(text, qrcodegen.QrCode.Ecc.MEDIUM);
    } catch (error) {
        canvas.hidden = true;
        save.disabled = true;
        message.textContent = "That text is too long for one QR code.";
        return;
    }

    const scale = 8;
    const border = 4;
    const size = (qr.size + border * 2) * scale;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    for (let y = -border; y < qr.size + border; y += 1) {
        for (let x = -border; x < qr.size + border; x += 1) {
            context.fillStyle = qr.getModule(x, y) ? "#00101f" : "#ffffff";
            context.fillRect((x + border) * scale, (y + border) * scale, scale, scale);
        }
    }
    canvas.hidden = false;
    save.disabled = false;
    message.textContent = "";
}

function setupQr() {
    const input = document.querySelector("#qr-text");
    const form = document.querySelector("#qr-form");
    input.addEventListener("input", () => drawQr(input.value.trim()));
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        const canvas = document.querySelector("#qr-canvas");
        if (canvas.hidden) return;
        canvas.toBlob((blob) => {
            if (!blob) return;
            saveBlob(blob, "qrcode.png");
        });
    });
}

startSnow();
setupGate();
if (sessionStorage.getItem(SESSION_KEY) === "yes") openTools();
