// Content script — injected into localhost:3210
// Bridges postMessage from Web App to Service Worker

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data
  if (data?.source !== 'XEGINEER_WEBAPP') return

  chrome.runtime.sendMessage(data, (response) => {
    if (chrome.runtime.lastError) {
      window.postMessage({
        source: 'XEGINEER_EXTENSION',
        requestId: data.requestId,
        success: false,
        error: chrome.runtime.lastError.message ?? 'Extension error',
      }, '*')
      return
    }
    window.postMessage({ ...response, source: 'XEGINEER_EXTENSION' }, '*')
  })
})
