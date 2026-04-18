// DOM elemek
const loadCamBtn = document.getElementById("loadCamBtn");
const videoElement = document.getElementById("video_sec");
const countdown = document.getElementById("countdown");
const statusText = document.getElementById("status_text");
const balanceDisplay = document.getElementById("balanceDisplay");
const betAmountInput = document.getElementById("betAmount");
const resultMessage = document.getElementById("resultMessage");
const bucketGroup = document.getElementById("bucketGroup");
const bucketGrid = document.getElementById("bucketGrid");
const betTimer = document.getElementById("betTimer");
const betTimerValue = document.getElementById("betTimerValue");
const liveStatsBox = document.getElementById("liveStatsBox");
const liveCountValue = document.getElementById("liveCountValue");
const progressFill = document.getElementById("progressFill");

// Játék állapot
let pollingInterval = null;
let betTimerInterval = null;
let userBalance = 1000;
let currentBet = 0;
let currentBucket = null;       // kiválasztott vödör, vagy null (nézői kör)
let actualVehicleCount = 0;
let currentJobId = null;
let isBetPlaced = false;
let countEvents = [];
let lastLiveCount = 0;

// --- Segédfüggvények ---

function updateBalance(amount) {
    userBalance += amount;
    balanceDisplay.textContent = userBalance;
}

function resetLiveStats() {
    lastLiveCount = 0;
    liveCountValue.textContent = "0";
    liveCountValue.classList.remove("pulse");
    progressFill.style.width = "100%";
    liveStatsBox.classList.remove("final");
}

function countEventsUpTo(currentTime) {
    let n = 0;
    for (const t of countEvents) {
        if (t <= currentTime) n++;
        else break;
    }
    return n;
}

function clearBetUi() {
    clearInterval(betTimerInterval);
    betTimerInterval = null;
    betTimer.style.display = "none";
    betTimer.classList.remove("warning", "critical");
    bucketGroup.style.display = "none";
    bucketGrid.innerHTML = "";
    currentBucket = null;
    betAmountInput.disabled = false;
}

function renderBuckets(buckets) {
    bucketGrid.innerHTML = "";
    for (const b of buckets) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "bucket-btn";
        btn.disabled = !!b.disabled;

        const lbl = document.createElement("span");
        lbl.className = "bucket-label";
        lbl.textContent = b.label;
        btn.appendChild(lbl);

        const payout = document.createElement("span");
        payout.className = "bucket-payout";
        payout.textContent = b.disabled ? "—" : `${b.payout.toFixed(2)}×`;
        btn.appendChild(payout);

        btn.addEventListener("click", () => placeBet(b, btn));
        bucketGrid.appendChild(btn);
    }
}

function startBetTimer(seconds) {
    let remaining = seconds;
    betTimer.style.display = "block";
    betTimer.classList.remove("warning", "critical");
    betTimerValue.textContent = remaining;

    clearInterval(betTimerInterval);
    betTimerInterval = setInterval(() => {
        remaining -= 0.1;
        if (remaining <= 0) {
            clearInterval(betTimerInterval);
            betTimerInterval = null;
            betTimerValue.textContent = "0";
            betTimer.classList.add("critical");
            onBetTimerExpired();
            return;
        }
        betTimerValue.textContent = Math.ceil(remaining);
        if (remaining < 3) {
            betTimer.classList.add("critical");
            betTimer.classList.remove("warning");
        } else if (remaining < 6) {
            betTimer.classList.add("warning");
        }
    }, 100);
}

function onBetTimerExpired() {
    // Nincs fogadás: letiltjuk a vödröket, jelezzük nézői módot, polling indul
    for (const b of bucketGrid.querySelectorAll(".bucket-btn")) b.disabled = true;
    betAmountInput.disabled = true;

    statusText.style.display = "block";
    statusText.style.animation = "none";
    statusText.style.color = "var(--pink)";
    statusText.textContent = "Lejárt az idő — csak nézőként játszol tovább";
    setTimeout(startPolling, 1200);
}

function placeBet(bucket, btnEl) {
    const betVal = parseInt(betAmountInput.value);
    if (isNaN(betVal) || betVal <= 0) {
        alert("Kérlek érvényes tétet adj meg!");
        return;
    }
    if (betVal > userBalance) {
        alert("Nincs elég egyenleged ehhez a téthez!");
        return;
    }
    if (bucket.disabled) return;

    clearInterval(betTimerInterval);
    betTimerInterval = null;
    betTimer.style.display = "none";
    betTimer.classList.remove("warning", "critical");

    updateBalance(-betVal);
    currentBet = betVal;
    currentBucket = bucket;
    isBetPlaced = true;

    betAmountInput.disabled = true;
    for (const b of bucketGrid.querySelectorAll(".bucket-btn")) b.disabled = true;
    btnEl.classList.add("selected");

    startPolling();
}

async function startPolling() {
    statusText.style.display = "block";
    statusText.style.animation = "pulseText 1.5s infinite";
    statusText.style.color = "var(--cyan)";
    statusText.textContent = "Videófeldolgozás folyamatban...";

    pollingInterval = setInterval(async () => {
        try {
            const statusRes = await fetch(`http://localhost:5000/status/${currentJobId}`);
            const statusData = await statusRes.json();

            if (statusData.status === 'done') {
                clearInterval(pollingInterval);
                statusText.style.display = "none";

                actualVehicleCount = statusData.vehicle_count;
                countEvents = statusData.count_events || [];

                resetLiveStats();
                liveStatsBox.classList.add("visible");

                const videoRes = await fetch(`http://localhost:5000/video/${currentJobId}`);
                if (!videoRes.ok) throw new Error("Hiba a videó letöltésekor");

                const blob = await videoRes.blob();
                const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
                const video = document.createElement("video");
                video.src = url;
                video.autoplay = true;
                video.muted = true;
                video.controls = false;
                video.disablePictureInPicture = true;

                let rafId = null;
                let lastSecs = -1;
                const tick = () => {
                    if (video.paused || video.ended) { rafId = null; return; }
                    const duration = video.duration;
                    if (isFinite(duration) && duration > 0) {
                        const remaining = Math.max(0, duration - video.currentTime);
                        const secs = Math.floor(remaining % 60);
                        if (secs !== lastSecs) {
                            lastSecs = secs;
                            countdown.textContent = 00:${secs.toString().padStart(2, "0")};
                        }

                        const pct = (remaining / duration) * 100;
                        progressFill.style.width = pct + "%";

                        const counted = countEventsUpTo(video.currentTime);
                        if (counted !== lastLiveCount) {
                            lastLiveCount = counted;
                            liveCountValue.textContent = counted;
                            liveCountValue.classList.remove("pulse");
                            void liveCountValue.offsetWidth;
                            liveCountValue.classList.add("pulse");
                        }
                    }
                    rafId = requestAnimationFrame(tick);
                };

                video.addEventListener("play", () => {
                    countdown.classList.add("visible");
                    if (rafId === null) rafId = requestAnimationFrame(tick);
                });
                video.addEventListener("pause", () => {
                    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
                });

                video.addEventListener("ended", () => {
                    countdown.classList.remove("visible");
                    progressFill.style.width = "0%";
                    liveCountValue.textContent = actualVehicleCount;
                    liveStatsBox.classList.add("final");
                    evaluateBet();
                });

                videoElement.innerHTML = "";
                videoElement.appendChild(video);

            } else if (statusData.status === 'error') {
                clearInterval(pollingInterval);
                throw new Error("Szerver oldali hiba a feldolgozás során.");
            }
        } catch (pollError) {
            handleError(pollError);
        }
    }, 2000);
}

// --- Új kör indítása ---
loadCamBtn.addEventListener("click", async () => {
    loadCamBtn.disabled = true;
    loadCamBtn.textContent = "Kép sorsolása...";
    resultMessage.className = "";
    resultMessage.innerHTML = "";
    isBetPlaced = false;
    liveStatsBox.classList.remove("visible", "final");
    resetLiveStats();
    clearBetUi();

    try {
        videoElement.innerHTML = `<span class="video-placeholder">Kezdőpont betöltése...</span>`;
        statusText.style.display = "block";
        statusText.style.animation = "pulseText 1.5s infinite";
        statusText.style.color = "var(--cyan)";
        statusText.textContent = "Kamera csatlakozása...";
        countdown.classList.remove("visible");

        const startRes = await fetch("http://localhost:5000/start", { method: "POST" });
        const startData = await startRes.json();
        if (!startRes.ok) throw new Error(startData.error || "Hiba az indításkor");

        currentJobId = startData.job_id;

        // Első kép megjelenítése
        videoElement.innerHTML = "";
        const previewImg = document.createElement("img");
        previewImg.src = `data:image/jpeg;base64,${startData.first_frame_base64}`;
        videoElement.appendChild(previewImg);

        statusText.style.display = "none";

        // Vödrök + időzítő
        bucketGroup.style.display = "flex";
        renderBuckets(startData.buckets);
        betAmountInput.disabled = false;
        startBetTimer(startData.bet_seconds);

        loadCamBtn.style.display = "none";
        loadCamBtn.textContent = "📷 Következő helyzet";
    } catch (error) {
        handleError(error);
        loadCamBtn.disabled = false;
        loadCamBtn.textContent = "📷 Újrapróbálás";
    }
});

// --- Eredmény kiértékelése ---
function evaluateBet() {
    if (!isBetPlaced || !currentBucket) {
        // Nézői kör: nincs tét, csak információ
        resultMessage.className = "";
        resultMessage.innerHTML = `ℹ️ Végeredmény: ${actualVehicleCount} jármű haladt át.`;
    } else {
        const won =
            actualVehicleCount >= currentBucket.min &&
            actualVehicleCount <= currentBucket.max;

        if (won) {
            const winAmount = Math.round(currentBet * currentBucket.payout);
            updateBalance(winAmount);
            resultMessage.className = "win";
            resultMessage.innerHTML = `🎉 Nyertél ${winAmount} 🪙-t! (${currentBucket.payout.toFixed(2)}×) <br> Pontos szám: ${actualVehicleCount}`;
        } else {
            resultMessage.className = "lose";
            resultMessage.innerHTML = `❌ Vesztettél! <br> Pontos szám: ${actualVehicleCount}`;
        }
    }

    clearBetUi();
    loadCamBtn.style.display = "block";
    loadCamBtn.disabled = false;
}

// --- Hibakezelő ---
function handleError(error) {
    console.error(error);
    clearInterval(pollingInterval);
    clearInterval(betTimerInterval);
    betTimerInterval = null;
    liveStatsBox.classList.remove("visible", "final");
    statusText.style.display = "block";
    statusText.textContent = "Hiba: " + error.message;
    statusText.style.animation = "none";
    statusText.style.color = "var(--pink)";

    // Tét visszatérítése, ha már fogadtunk
    if (isBetPlaced) {
        updateBalance(currentBet);
        resultMessage.className = "";
        resultMessage.innerHTML = "Hiba történt, a téted visszajárt.";
    }

    clearBetUi();
    loadCamBtn.style.display = "block";
    loadCamBtn.disabled = false;
}
