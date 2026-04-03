const button = document.querySelector("button");
button.addEventListener("click", async () => {
    try{
        button.disabled = true; //Gomb kikapcsolása ideiglenesen
        console.log(`Started [${new Date().toLocaleTimeString()}]`);
        const res = await fetch("http://localhost:5000/generate", { method: "POST" });
        if (!res.ok) {
            throw new Error("Hiba: " + res.status);
        }

        //Vehicle count kinyerése és kiírása
        const vehicleCount = res.headers.get("X-Vehicle-Count");
        console.log("Vehicle count: " + vehicleCount);

        //Video megjelenítése
        const blob = await res.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
        const video = document.createElement("video");

        //Videó megállíthatatlanná tétele
        video.src = url;
        video.autoplay = true;
        video.muted = true;
        video.controls = false;
        video.disablePictureInPicture = true;

        const countdown = document.getElementById("countdown");

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

        const videoElement = document.getElementById("video_sec")
        videoElement.innerHTML = "";
        videoElement.appendChild(video);

        console.log(`Finished [${new Date().toLocaleTimeString()}]`);
    }catch (error) {
        console.error(error);
    } finally{
        button.disabled = false; //Gomb visszakapcsolása
    }
});
