function tabCapture() {
  return new Promise((resolve) => {
    chrome.tabCapture.capture(
      {
        audio: true,
        video: false,
      },
      (stream) => {
        resolve(stream);
      }
    );
  });
}

function to16BitPCM(input) {
  const dataLength = input.length * (16 / 8);
  const dataBuffer = new ArrayBuffer(dataLength);
  const dataView = new DataView(dataBuffer);
  let offset = 0;
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    dataView.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return dataView;
}

function to16kHz(audioData, sampleRate = 44100) {
  const data = new Float32Array(audioData);
  const fitCount = Math.round(data.length * (16000 / sampleRate));
  const newData = new Float32Array(fitCount);
  const springFactor = (data.length - 1) / (fitCount - 1);
  newData[0] = data[0];
  for (let i = 1; i < fitCount - 1; i++) {
    const tmp = i * springFactor;
    const before = Math.floor(tmp).toFixed();
    const after = Math.ceil(tmp).toFixed();
    const atPoint = tmp - before;
    newData[i] = data[before] + (data[after] - data[before]) * atPoint;
  }
  newData[fitCount - 1] = data[data.length - 1];
  return newData;
}

function sendMessageToTab(tabId, data) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, data, (res) => {
      resolve(res);
    });
  });
}

async function startRecord(option) {
  const stream = await tabCapture();

  if (stream) {
    // call when the stream inactive
    stream.oninactive = () => {
      window.close();
    };

    const audioDataCache = [];
    const context = new AudioContext();
    const mediaStream = context.createMediaStreamSource(stream);
    const recorder = context.createScriptProcessor(0, 1, 1);

    recorder.onaudioprocess = async (event) => {
      if (!context) return;

      const inputData = event.inputBuffer.getChannelData(0);
      const output = to16kHz(inputData, context.sampleRate);
      const audioData = to16BitPCM(output);

      audioDataCache.push(...new Int8Array(audioData.buffer));

      if (audioDataCache.length > 1280) {
        const audioDataArray = new Int8Array(audioDataCache);

        // Process your audio data here
        // console.log(audioDataArray);

        // You can pass some data to current tab
        await sendMessageToTab(option.currentTabId, {
          type: "FROM_OPTION",
          data: audioDataArray.length,
        });

        audioDataCache.length = 0;
      }
    };

    // Prevent page mute
    mediaStream.connect(recorder);
    recorder.connect(context.destination);
    mediaStream.connect(context.destination);
  } else {
    window.close();
  }
}

// Receive data from Current Tab or Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { type, data } = request;

  switch (type) {
    case "START_RECORD":
      startRecord(data);
      break;
    default:
      break;
  }

  sendResponse({});
});
