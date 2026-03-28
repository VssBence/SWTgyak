const button = document.querySelector("button");
button.addEventListener("click", async () => {
    try{
        button.disabled = true; //Gomb kikapcsolása ideiglenesen
        console.log("Started");
        const res = await fetch("http://localhost:5000/generate", { method: "POST" });
        if (!res.ok) {
            throw new Error("Hiba: " + res.status);
        }

        const vehicleCount = res.headers.get("X-Vehicle-Count");
        console.log("Vehicle count: " + vehicleCount);

        const blob = await res.blob();
        const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
        const video = document.createElement("video");

        video.src = url;
        video.autoplay = true;
        video.muted = true;    
        video.controls = false;
        video.disablePictureInPicture = true;

        const videoElement = document.getElementById("video_sec")
        videoElement.innerHTML = "";
        videoElement.appendChild(video);

        console.log("Finished");
    }catch (error) {
        console.error(error);
    } finally{
        button.disabled = false; //Gomb visszakapcsolása
    }
});
