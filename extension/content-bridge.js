/**
 * Bridge between the ITRS DEM web app and the extension service worker.
 * Page uses window.postMessage; we relay to chrome.runtime.
 */
;(function () {
  const PAGE = 'itrs-dem'
  const EXT = 'itrs-dem-extension'

  function reply(payload) {
    window.postMessage({ source: EXT, ...payload }, window.location.origin)
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== PAGE || typeof data.type !== 'string') return

    const requestId = data.requestId
    chrome.runtime.sendMessage(
      {
        type: data.type,
        step: data.step,
      },
      (response) => {
        const err = chrome.runtime.lastError
        if (err) {
          reply({
            type: 'error',
            requestId,
            error: err.message,
            installed: false,
          })
          return
        }
        reply({
          type: `${data.type}_result`,
          requestId,
          ...(response ?? { ok: false }),
          installed: true,
        })
      },
    )
  })

  // Announce presence early so the app can detect the extension.
  reply({ type: 'ready', installed: true })
})()
