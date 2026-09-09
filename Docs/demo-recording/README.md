# Actual browser demonstration

Watch `sightline-browser-v02.mp4` (about 38 seconds). It shows real local WASM vision and Qwen suggestions completing Pending → Review on synthetic data. No form is submitted. The original AV1 WebM is preserved; the MP4 is a compatibility transcode without cuts or speed-up. Variable frame output and container timing differ slightly; see manifest.json. This is a browser JavaScript run, not a native extension demonstration or latency benchmark.

## Description

The original synthetic service desk sits beside its protected reconstruction. Local capture masks personal content; the server receives approved controls and geometry. Qwen proposes Pending. After operator confirmation, the page opens Pending requests. A fresh capture produces Review. Confirmation reaches Request ready for review. The final protected view belongs to the preceding capture and is revoked for further action.

## Verification

The complete files decode with ffmpeg. The first, intermediate and last images were inspected; the last image shows the required end-state. The website MP4 plays through its 37.907-second duration in actual Chrome with ended=true, readyState 4 and no media error. Website video controls, a text description and a download provide fallback access. Public deployment playback is verified separately.

## Failed attempt retained as a failure

A prior Page.startScreencast attempt lost buffered events and reset the automation connection. Seven partial frames remain locally ignored under frames/. They are not used in the published video. The completed recording used Chrome's stream-based recorder, as documented at https://chromedevtools.github.io/devtools-protocol/tot/Page/ and https://chromedevtools.github.io/devtools-protocol/tot/IO/.
