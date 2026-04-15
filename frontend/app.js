const button = document.querySelector("button");
const videoElement = document.getElementById("video_sec");
const countdown = document.getElementById("countdown");
const statusText = document.getElementById("status_text");

let pollingInterval = null;

button.addEventListener("click", async () => {
    try {
        button.disabled = true; // Gomb kikapcsolása ideiglenesen
        console.log(`Started [${new Date().toLocaleTimeString()}]`);
        
        // Felület alaphelyzetbe állítása új lekérdezésnél
        videoElement.innerHTML = "";
        countdown.classList.remove("visible");
        statusText.style.display = "block";
        statusText.textContent = "Kezdőpont sorsolása...";

        // 1. Kérés elküldése a /start végpontra
        const startRes = await fetch("http://localhost:5000/start", { method: "POST" });
        const startData = await startRes.json();

        if (!startRes.ok) {
            throw new Error(startData.error || "Hiba az indításkor");
        }

        const jobId = startData.job_id;

        // 2. Első képkocka megjelenítése a várakozás alatt
        const previewImg = document.createElement("img");
        previewImg.src = `data:image/jpeg;base64,${startData.first_frame_base64}`;
        previewImg.alt = "Kezdő képkocka";
        previewImg.style.width = "100%"; // Opcionális, CSS-ből is jöhet
        videoElement.appendChild(previewImg);

        statusText.textContent = "Videófeldolgozás folyamatban...";

        // 3. Polling indítása: 2 másodpercenként lekérdezzük, kész van-e
        pollingInterval = setInterval(async () => {
            try {
                const statusRes = await fetch(`http://localhost:5000/status/${jobId}`);
                const statusData = await statusRes.json();

                if (statusData.status === 'done') {
                    // --- KÉSZ A VIDEÓ ---
                    clearInterval(pollingInterval);
                    statusText.style.display = "none";

                    // Vehicle count kinyerése a JSON-ből
                    const vehicleCount = statusData.vehicle_count;
                    console.log("Vehicle count: " + vehicleCount);

                    // Videó letöltése Blob-ként
                    const videoRes = await fetch(`http://localhost:5000/video/${jobId}`);
                    if (!videoRes.ok) throw new Error("Hiba a videó letöltésekor");

                    const blob = await videoRes.blob();
                    const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
                    const video = document.createElement("video");

                    // Videó megállíthatatlanná tétele
                    video.src = url;
                    video.autoplay = true;
                    video.muted = true;
                    video.controls = false;
                    video.disablePictureInPicture = true;

                    // Visszaszámláló eseménykezelők
                    video.addEventListener("play", () => {
                        countdown.classList.add("visible");
                    });

                    video.addEventListener("timeupdate", () => {
                        const remaining = video.duration - video.currentTime;
                        if (!isFinite(remaining)) return;
                        const secs = Math.floor(remaining % 60).toString().padStart(2, "0");
                        countdown.textContent = `${secs}`;
                    });

                    video.addEventListener("ended", () => {
                        countdown.classList.remove("visible");
                    });

                    // Cseréljük le a képet a lejátszható videóra
                    videoElement.innerHTML = "";
                    videoElement.appendChild(video);

                    console.log(`Finished [${new Date().toLocaleTimeString()}]`);
                    button.disabled = false; // Gomb visszakapcsolása

                } else if (statusData.status === 'error') {
                    // --- HIBA A SZERVEREN ---
                    clearInterval(pollingInterval);
                    throw new Error("Szerver oldali hiba a feldolgozás során.");
                }
                // Ha a status 'processing', akkor nem csinálunk semmit, a ciklus pörög tovább

            } catch (pollError) {
                console.error(pollError);
                clearInterval(pollingInterval);
                statusText.textContent = "Hiba történt a kommunikáció során.";
                button.disabled = false;
            }
        }, 2000); // Két másodpercenkénti lekérdezés

    } catch (error) {
        console.error(error);
        statusText.textContent = "Hiba: " + error.message;
        button.disabled = false; // Gomb visszakapcsolása hiba esetén is
    }
});