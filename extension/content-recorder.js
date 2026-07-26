/**
 * Records Navigate / Click / Type on the active tab while recording is ON.
 */
;(function () {
  if (window.__ITRS_DEM_RECORDER__) return
  window.__ITRS_DEM_RECORDER__ = true

  let recording = false
  let lastNavUrl = ''

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
    if (aria) return `${el.tagName.toLowerCase()}[aria-label="${aria.slice(0, 80).replace(/"/g, '\\"')}"]`
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

  function sendStep(step) {
    if (!recording) return
    chrome.runtime.sendMessage({ type: 'add_step', step }, () => {
      void chrome.runtime.lastError
    })
  }

  function recordNavigate(reason) {
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
    if (!recording) return
    const target = event.target
    if (!(target instanceof Element)) return
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
    if (!recording) return
    const el = event.target
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
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
    const data = await chrome.storage.local.get('itrsDemRecordingFlag')
    const next = Boolean(data.itrsDemRecordingFlag)
    const was = recording
    recording = next
    if (recording && !was) {
      lastNavUrl = ''
      recordNavigate('load')
    }
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.itrsDemRecordingFlag) {
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
