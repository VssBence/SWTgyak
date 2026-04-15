// DOM Elemek
const startBtn = document.getElementById("startBtn");
const loadCamBtn = document.getElementById("loadCamBtn");
const videoElement = document.getElementById("video_sec");
const countdown = document.getElementById("countdown");
const statusText = document.getElementById("status_text");
const balanceDisplay = document.getElementById("balanceDisplay");
const betAmountInput = document.getElementById("betAmount");
const guessNumberInput = document.getElementById("guessNumber");
const resultMessage = document.getElementById("resultMessage");
const guessTypeInputs = document.getElementsByName("guessType");
const radioLabels = document.querySelectorAll(".radio-group label");

// Játék Állapot
let pollingInterval = null;
let userBalance = 1000;
let currentBet = 0;
let currentGuess = 0;
let currentGuessType = "exact";
let actualVehicleCount = 0; // A szervertől kapott valós adat
let currentJobId = null;
let isBetPlaced = false;

// Segédfüggvény: Vezérlők engedélyezése / tiltása
function setControlsDisabled(disabled) {
    betAmountInput.disabled = disabled;
    guessNumberInput.disabled = disabled;
    for (let radio of guessTypeInputs) radio.disabled = disabled;
    for (let label of radioLabels) {
        label.style.opacity = disabled ? "0.5" : "1";
        label.style.cursor = disabled ? "not-allowed" : "pointer";
        label.style.pointerEvents = disabled ? "none" : "auto";
    }
}

// Kezdetben lezárjuk a fogadást, amíg nincs kép
setControlsDisabled(true);

// Segédfüggvény: kiválasztott rádiógomb értékének lekérése
function getSelectedGuessType() {
    for (const radio of guessTypeInputs) {
        if (radio.checked) return radio.value;
    }
    return "exact";
}

// Egyenleg frissítő
function updateBalance(amount) {
    userBalance += amount;
    balanceDisplay.textContent = userBalance;
}

// --- 1. FÁZIS: ÚJ KAMERAKÉP LEKÉRÉSE ---
loadCamBtn.addEventListener("click", async () => {
    loadCamBtn.disabled = true;
    loadCamBtn.textContent = "Kép sorsolása...";
    resultMessage.className = "";
    resultMessage.innerHTML = "";
    isBetPlaced = false;

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

        statusText.textContent = "Helyzet betöltve. Tedd meg a téted!";
        statusText.style.animation = "none";

        // Gombok és vezérlők feloldása a fogadáshoz
        loadCamBtn.style.display = "none";
        loadCamBtn.textContent = "📷 Következő helyzet";
        startBtn.style.display = "block";
        startBtn.disabled = false;
        setControlsDisabled(false);

    } catch (error) {
        handleError(error);
        loadCamBtn.disabled = false;
        loadCamBtn.textContent = "📷 Újrapróbálás";
    }
});

// --- 2. FÁZIS: FOGADÁS ÉS VIDEÓ FELDOLGOZÁS ---
startBtn.addEventListener("click", async () => {
    // 1. Fogadás érvényesítése
    const betVal = parseInt(betAmountInput.value);
    const guessVal = parseInt(guessNumberInput.value);
            
    if (isNaN(betVal) || betVal <= 0) {
        alert("Kérlek érvényes tétet adj meg!");
        return;
    }
    if (betVal > userBalance) {
        alert("Nincs elég egyenleged ehhez a téthez!");
        return;
    }
    if (isNaN(guessVal) || guessVal < 0) {
        alert("Kérlek érvényes autószámot adj meg!");
        return;
    }

    // 2. Tét levonása, adatok mentése a körre
    updateBalance(-betVal);
    currentBet = betVal;
    currentGuess = guessVal;
    currentGuessType = getSelectedGuessType();
    isBetPlaced = true;
            
    // 3. UI zárolása futás közben
    startBtn.disabled = true;
    setControlsDisabled(true);
            
    resultMessage.className = "";
    resultMessage.innerHTML = "";
            
    try {
        statusText.style.display = "block";
        statusText.style.animation = "pulseText 1.5s infinite";
        statusText.style.color = "var(--cyan)";
        statusText.textContent = "Videófeldolgozás folyamatban...";

        // Polling
        pollingInterval = setInterval(async () => {
            try {
                const statusRes = await fetch(`http://localhost:5000/status/${currentJobId}`);
                const statusData = await statusRes.json();

                if (statusData.status === 'done') {
                    clearInterval(pollingInterval);
                    statusText.style.display = "none";

                    // Eltároljuk az eredményt, de MÉG NEM mutatjuk meg!
                    actualVehicleCount = statusData.vehicle_count;
                    console.log("Valós darabszám: " + actualVehicleCount);

                    // Videó lekérése és lejátszása
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

                    video.addEventListener("play", () => {
                        countdown.classList.add("visible");
                    });

                    video.addEventListener("timeupdate", () => {
                        const remaining = video.duration - video.currentTime;
                        if (!isFinite(remaining)) return;
                        const secs = Math.floor(remaining % 60).toString().padStart(2, "0");
                        countdown.textContent = `00:${secs}`;
                    });

                    // --- AMIKOR A VIDEÓ VÉGET ÉR: EREDMÉNYHIRDETÉS ---
                    video.addEventListener("ended", () => {
                        countdown.classList.remove("visible");
                        evaluateBet(); // Itt dől el a fogadás sorsa
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

    } catch (error) {
        handleError(error);
    }
});

// Eredmény kiértékelése
function evaluateBet() {
    let won = false;
    let multiplier = 0;

    if (currentGuessType === "exact" && actualVehicleCount === currentGuess) {
        won = true;
        multiplier = 5;
    } else if (currentGuessType === "min" && actualVehicleCount < currentGuess) {
        // 'min' itt "Kevesebb, mint"-re van fordítva a magyar UI-on
        won = true;
        multiplier = 2;
    } else if (currentGuessType === "max" && actualVehicleCount > currentGuess) {
        // 'max' itt "Több, mint"-re van fordítva a magyar UI-on
        won = true;
        multiplier = 2;
    }

    if (won) {
        const winAmount = currentBet * multiplier;
        updateBalance(winAmount);
        resultMessage.className = "win";
        resultMessage.innerHTML = `🎉 Nyertél ${winAmount} 🪙-t! <br> A pontos szám: ${actualVehicleCount}`;
    } else {
        resultMessage.className = "lose";
        resultMessage.innerHTML = `❌ Vesztettél! <br> A pontos szám: ${actualVehicleCount}`;
    }

    // Következő kör előkészítése: Visszahozzuk a "Helyzet betöltése" gombot, és lezárjuk a tét gombokat
    startBtn.style.display = "none";
    loadCamBtn.style.display = "block";
    loadCamBtn.disabled = false;
    setControlsDisabled(true);
}

// Hibakezelő segédfüggvény (Ha megszakad, visszaadjuk a tétet)
function handleError(error) {
    console.error(error);
    clearInterval(pollingInterval);
    statusText.style.display = "block";
    statusText.textContent = "Hiba: " + error.message;
    statusText.style.animation = "none";
    statusText.style.color = "var(--pink)";
            
    // Tét visszatérítése hiba esetén, DE csak ha már fogadtunk
    if (isBetPlaced) {
        updateBalance(currentBet);
        resultMessage.className = "";
        resultMessage.innerHTML = "Hiba történt, a téted visszajárt.";
    }
            
    startBtn.style.display = "none";
    loadCamBtn.style.display = "block";
    loadCamBtn.disabled = false;
    setControlsDisabled(true);
}