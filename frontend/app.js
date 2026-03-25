const button = document.querySelector("button");
button.addEventListener("click", async () => {
    const res = await fetch("http://localhost:5000/generate", { method: "POST" });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    document.getElementById("video_sec").appendChild(video);
});
