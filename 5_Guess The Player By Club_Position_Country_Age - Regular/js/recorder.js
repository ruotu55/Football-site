export const recorderState = {
    mediaRecorder: null,
    recordedChunks: [],
    stream: null,
    isRequesting: false
  };
  
  export async function startRecording() {
    if (recorderState.isRequesting) return false;
    if (recorderState.mediaRecorder && recorderState.mediaRecorder.state === "recording") return true;
  
    recorderState.isRequesting = true;
  
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "browser",
          frameRate: { ideal: 60 },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: {
          suppressLocalAudioPlayback: false 
        },
        preferCurrentTab: true 
      });
  
      recorderState.stream = stream;
      recorderState.recordedChunks = [];
  
      // Prioritize high-quality VP9 codec, fallback to standard webm
      let options = { mimeType: 'video/webm; codecs=vp9', videoBitsPerSecond: 8000000 }; 
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm', videoBitsPerSecond: 8000000 };
      }
  
      recorderState.mediaRecorder = new MediaRecorder(stream, options);
  
      recorderState.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recorderState.recordedChunks.push(event.data);
        }
      };
  
      recorderState.mediaRecorder.onstop = () => {
        showDownloadPrompt();
      };
  
      recorderState.mediaRecorder.start();
      return true;
    } catch (err) {
      console.warn("Screen recording was cancelled or failed:", err);
      return false;
    } finally {
      recorderState.isRequesting = false;
    }
  }
  
  export function stopRecording() {
    if (recorderState.mediaRecorder && recorderState.mediaRecorder.state !== "inactive") {
      recorderState.mediaRecorder.stop();
    }
    if (recorderState.stream) {
      recorderState.stream.getTracks().forEach(track => track.stop());
      recorderState.stream = null;
    }
  }
  
  function showDownloadPrompt() {
    const modal = document.getElementById("download-modal");
    if (modal) modal.hidden = false;
  }
  
  export function downloadVideo() {
    if (recorderState.recordedChunks.length === 0) {
      closeDownloadPrompt();
      return;
    }
  
    const blob = new Blob(recorderState.recordedChunks, {
      type: recorderState.mediaRecorder.mimeType || 'video/webm'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    document.body.appendChild(a);
    a.style.display = 'none';
    a.href = url;
    a.download = `Football_Quiz_Studio_${new Date().getTime()}.webm`;
    a.click();
    
    window.URL.revokeObjectURL(url);
    closeDownloadPrompt();
  }
  
  export function closeDownloadPrompt() {
    const modal = document.getElementById("download-modal");
    if (modal) modal.hidden = true;
    recorderState.recordedChunks = [];
  }