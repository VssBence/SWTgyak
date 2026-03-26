const button = document.querySelector("button");
button.addEventListener("click", async () => {
    button.disabled = true;
    console.log("Started");
    const res = await fetch("http://localhost:5000/generate", { method: "POST" }).then(
        (res) => {
            if (!res.ok) {
                throw new Error("Hiba: " + res.status);
            }
            return res;
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(new Blob([blob], { type: 'video/mp4' }));
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    document.getElementById("video_sec").appendChild(video);
    console.log("Finished");
});
