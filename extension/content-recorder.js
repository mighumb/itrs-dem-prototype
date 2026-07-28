/**
 * Records Navigate / Click / Type while recording is ON.
 * Shows a clear REC bar on the site tab being recorded.
 */
;(function () {
  if (window.__ITRS_DEM_RECORDER__) return
  window.__ITRS_DEM_RECORDER__ = true

  let recording = false
  let lastNavUrl = ''
  let bannerEl = null

  function isDemAppPage() {
    const h = location.hostname
    return (
      h === 'localhost' ||
      h === '127.0.0.1' ||
      h.endsWith('.vercel.app') ||
      h === 'mighumb.github.io'
    )
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(value)
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  }

  function shortSelector(el) {
    if (!(el instanceof Element)) return undefined
    if (el.id) return `#${cssEscape(el.id)}`
    const testId =
      el.getAttribute('data-testid') ||
      el.getAttribute('data-test') ||
      el.getAttribute('data-qa')
    if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`
    const aria = el.getAttribute('aria-label')
    if (aria) {
      return `${el.tagName.toLowerCase()}[aria-label="${aria.slice(0, 80).replace(/"/g, '\\"')}"]`
    }
    const name = el.getAttribute('name')
    if (name) return `${el.tagName.toLowerCase()}[name="${cssEscape(name)}"]`
    return el.tagName.toLowerCase()
  }

  function labelFor(el) {
    if (!(el instanceof Element)) return 'Element'
    const aria = el.getAttribute('aria-label')?.trim()
    if (aria) return aria.slice(0, 120)
    const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    if (text) return text.slice(0, 120)
    const title = el.getAttribute('title')?.trim()
    if (title) return title.slice(0, 120)
    const alt = el.getAttribute('alt')?.trim()
    if (alt) return alt.slice(0, 120)
    const name = el.getAttribute('name')?.trim()
    if (name) return name.slice(0, 120)
    const placeholder = el.getAttribute('placeholder')?.trim()
    if (placeholder) return placeholder.slice(0, 120)
    return el.tagName.toLowerCase()
  }

  function isSensitive(el) {
    if (!(el instanceof HTMLInputElement)) return false
    const type = (el.type || '').toLowerCase()
    if (type === 'password') return true
    const name = `${el.name || ''} ${el.id || ''} ${el.autocomplete || ''}`.toLowerCase()
    return /password|passwd|pwd|secret|card|cvv|cvc|ssn/.test(name)
  }

  function ensureBanner() {
    if (isDemAppPage()) return
    if (bannerEl && document.documentElement.contains(bannerEl)) return
    bannerEl = document.createElement('div')
    bannerEl.id = 'itrs-dem-rec-banner'
    bannerEl.setAttribute('data-itrs-dem', 'rec-banner')
    bannerEl.innerHTML = `
      <span class="itrs-dem-rec-dot" aria-hidden="true"></span>
      <span class="itrs-dem-rec-text"><strong>ITRS DEM</strong> · Enregistrement en cours</span>
      <button type="button" class="itrs-dem-rec-stop" id="itrs-dem-rec-stop">
        Arrêter et importer
      </button>
    `
    const style = document.createElement('style')
    style.textContent = `
      #itrs-dem-rec-banner {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        gap: 10px !important;
        padding: 8px 12px !important;
        background: #b91c1c !important;
        color: #fff !important;
        font: 600 13px/1.3 system-ui, -apple-system, sans-serif !important;
        box-shadow: 0 2px 12px rgba(0,0,0,.25) !important;
        pointer-events: auto !important;
        box-sizing: border-box !important;
      }
      #itrs-dem-rec-banner .itrs-dem-rec-text {
        flex: 1 1 auto !important;
        min-width: 0 !important;
        pointer-events: none !important;
      }
      #itrs-dem-rec-banner .itrs-dem-rec-dot {
        width: 8px; height: 8px; border-radius: 99px; flex-shrink: 0;
        background: #fff; box-shadow: 0 0 0 0 rgba(255,255,255,.7);
        animation: itrs-dem-pulse 1.2s ease-out infinite;
        pointer-events: none !important;
      }
      #itrs-dem-rec-banner .itrs-dem-rec-stop {
        flex-shrink: 0 !important;
        margin-left: auto !important;
        cursor: pointer !important;
        border: 0 !important;
        border-radius: 8px !important;
        padding: 7px 12px !important;
        background: #fff !important;
        color: #b91c1c !important;
        font: 650 12px/1.2 system-ui, -apple-system, sans-serif !important;
        box-shadow: 0 1px 2px rgba(0,0,0,.12) !important;
      }
      #itrs-dem-rec-banner .itrs-dem-rec-stop:hover {
        background: #fef2f2 !important;
      }
      #itrs-dem-rec-banner .itrs-dem-rec-stop:disabled {
        opacity: 0.7 !important;
        cursor: wait !important;
      }
      @keyframes itrs-dem-pulse {
        0% { box-shadow: 0 0 0 0 rgba(255,255,255,.65); }
        70% { box-shadow: 0 0 0 8px rgba(255,255,255,0); }
        100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
      }
      html.itrs-dem-recording { scroll-padding-top: 48px !important; }
      body.itrs-dem-recording { padding-top: 48px !important; }
    `
    bannerEl.prepend(style)
    const stopBtn = bannerEl.querySelector('#itrs-dem-rec-stop')
    if (stopBtn instanceof HTMLButtonElement) {
      stopBtn.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (stopBtn.disabled) return
        stopBtn.disabled = true
        stopBtn.textContent = 'Import…'
        chrome.runtime.sendMessage({ type: 'stop_and_import' }, () => {
          void chrome.runtime.lastError
          // Banner will disappear when recording flag clears.
        })
      })
    }
    document.documentElement.classList.add('itrs-dem-recording')
    document.body?.classList.add('itrs-dem-recording')
    ;(document.body || document.documentElement).appendChild(bannerEl)
  }

  function removeBanner() {
    bannerEl?.remove()
    bannerEl = null
    document.documentElement.classList.remove('itrs-dem-recording')
    document.body?.classList.remove('itrs-dem-recording')
  }

  function sendStep(step) {
    if (!recording || isDemAppPage()) return
    chrome.runtime.sendMessage({ type: 'add_step', step }, () => {
      void chrome.runtime.lastError
    })
  }

  function recordNavigate(reason) {
    if (isDemAppPage()) return
    const url = location.href
    if (!url || url === lastNavUrl) return
    lastNavUrl = url
    sendStep({
      id: `nav-${Date.now()}`,
      action: 'Navigate',
      label: document.title?.trim() || url,
      url,
      href: url,
      targetHint: reason === 'load' ? document.title?.trim() : undefined,
      at: Date.now(),
    })
  }

  function onClick(event) {
    if (!recording || isDemAppPage()) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('#itrs-dem-rec-banner')) return
    const clickable = target.closest(
      'a,button,input[type="submit"],input[type="button"],[role="button"],[onclick]',
    )
    if (!clickable) return

    const href =
      clickable instanceof HTMLAnchorElement
        ? clickable.href
        : clickable.getAttribute('href') || undefined

    sendStep({
      id: `click-${Date.now()}`,
      action: 'Click',
      label: labelFor(clickable),
      url: location.href,
      href: href || undefined,
      targetHint: labelFor(clickable),
      selector: shortSelector(clickable),
      at: Date.now(),
    })
  }

  function onChange(event) {
    if (!recording || isDemAppPage()) return
    const el = event.target
    if (
      !(
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
    ) {
      return
    }
    if (isSensitive(el)) return
    const value =
      el instanceof HTMLSelectElement
        ? el.options[el.selectedIndex]?.text?.trim() || el.value
        : el.value
    if (!value) return

    sendStep({
      id: `type-${Date.now()}`,
      action: 'Type',
      label: `Type in ${labelFor(el)}`,
      url: location.href,
      targetHint: labelFor(el),
      selector: shortSelector(el),
      at: Date.now(),
    })
  }

  async function syncFlag() {
    const data = await chrome.storage.local.get(['itrsDemRecordingFlag', 'itrsDemRecordingTabId'])
    const next = Boolean(data.itrsDemRecordingFlag)
    const was = recording
    recording = next

    const tabHint = data.itrsDemRecordingTabId

    // Resolve this tab's id, then show the banner ONLY on the dedicated recording tab.
    // Never fall back to "all tabs" when id is unknown — hide until we know.
    chrome.runtime.sendMessage({ type: 'whoami' }, (res) => {
      void chrome.runtime.lastError
      const myTabId = res?.tabId
      const onRecordingTab =
        typeof tabHint === 'number' && typeof myTabId === 'number' && myTabId === tabHint

      if (recording && onRecordingTab && !isDemAppPage()) {
        ensureBanner()
        if (!was) {
          lastNavUrl = ''
          recordNavigate('load')
        }
      } else {
        removeBanner()
      }
    })
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      area === 'local' &&
      (changes.itrsDemRecordingFlag || changes.itrsDemRecordingTabId)
    ) {
      void syncFlag()
    }
  })

  document.addEventListener('click', onClick, true)
  document.addEventListener('change', onChange, true)
  window.addEventListener('popstate', () => recordNavigate('popstate'))

  const pushState = history.pushState
  history.pushState = function (...args) {
    const result = pushState.apply(this, args)
    recordNavigate('pushState')
    return result
  }
  const replaceState = history.replaceState
  history.replaceState = function (...args) {
    const result = replaceState.apply(this, args)
    recordNavigate('replaceState')
    return result
  }

  void syncFlag()
})()
