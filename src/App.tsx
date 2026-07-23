import { useEffect, useRef, useState } from 'react'
import AuthModal, { type AuthMode } from './components/AuthModal'
import BookDemoModal from './components/BookDemoModal'
import GlobalAgent from './components/GlobalAgent'
import SaveModal from './components/SaveModal'
import ScheduleDrawer from './components/ScheduleDrawer'
import Shell from './components/Shell'
import TopHeader from './components/TopHeader'
import { DEFAULT_SCHEDULE } from './mock/schedule'
import Home from './screens/Home'
import NewJourney, { type NewJourneyHandle } from './screens/NewJourney'
import type { JourneySchedule, Screen } from './types'

interface JourneyHeaderState {
  title: string
  subtitle?: string
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [prompt, setPrompt] = useState('')
  const [agentOpen, setAgentOpen] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [scheduleDrawerOpen, setScheduleDrawerOpen] = useState(false)
  const [pendingSchedule, setPendingSchedule] = useState<JourneySchedule | null>(null)
  const [accountCreated, setAccountCreated] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [demoOpen, setDemoOpen] = useState(false)
  const [journeyHeader, setJourneyHeader] = useState<JourneyHeaderState | null>(null)
  const [journeySession, setJourneySession] = useState(0)
  const [homeSession, setHomeSession] = useState(0)
  const journeyRef = useRef<NewJourneyHandle>(null)
  const pendingScheduleSource = useRef<'accept' | 'customize' | null>(null)

  const handleStart = (value: string) => {
    setPrompt(value)
    setPendingSchedule(null)
    setJourneySession((session) => session + 1)
    setScreen('new-journey')
  }

  const handleGoHome = () => {
    setPrompt('')
    setPendingSchedule(null)
    setJourneyHeader(null)
    setScheduleDrawerOpen(false)
    setSaveOpen(false)
    setHomeSession((session) => session + 1)
    setScreen('home')
  }

  const handleAgentNavigate = (target: string) => {
    if (target === 'Create a new journey') {
      handleGoHome()
    }
  }

  const openSaveModal = (schedule: JourneySchedule | null, source?: 'accept' | 'customize') => {
    pendingScheduleSource.current = source ?? null
    setPendingSchedule(schedule)
    setSaveOpen(true)
  }

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode)
    setAuthOpen(true)
  }

  useEffect(() => {
    if (screen !== 'new-journey') {
      setJourneyHeader(null)
    }
  }, [screen])

  const handleAccountSuccess = () => {
    setAuthOpen(false)
    setSaveOpen(false)
    setAccountCreated(true)
    setScreen('home')
  }

  return (
    <div className="flex h-[100dvh] flex-col">
      {!accountCreated && (
        <TopHeader
          onLogIn={() => openAuth('login')}
          onSignUp={() => openAuth('signup')}
          onBookDemo={() => setDemoOpen(true)}
          onHome={handleGoHome}
          journeyTitle={journeyHeader?.title}
          journeySubtitle={journeyHeader?.subtitle}
        />
      )}

      <div className="min-h-0 flex-1">
        <Shell minimal={!accountCreated} onHome={handleGoHome}>
        {screen === 'home' && (
          <Home
            key={homeSession}
            userName={accountCreated ? 'Miguel' : 'there'}
            onStart={handleStart}
          />
        )}

        {screen === 'new-journey' && (
          <NewJourney
            ref={journeyRef}
            key={`${journeySession}-${prompt || 'default'}`}
            initialPrompt={prompt}
            isMonitored={accountCreated}
            onHeaderChange={setJourneyHeader}
            onSave={() => openSaveModal(pendingSchedule)}
            onAcceptSchedule={() => openSaveModal(DEFAULT_SCHEDULE, 'accept')}
            onCustomizeSchedule={() => setScheduleDrawerOpen(true)}
            onRequestNewJourney={handleStart}
          />
        )}
        </Shell>
      </div>

      {accountCreated && (
        <GlobalAgent
          open={agentOpen}
          onToggle={() => setAgentOpen((v) => !v)}
          onNavigate={handleAgentNavigate}
        />
      )}

      <ScheduleDrawer
        key={scheduleDrawerOpen ? 'open' : 'closed'}
        open={scheduleDrawerOpen}
        initial={pendingSchedule ?? DEFAULT_SCHEDULE}
        onClose={() => setScheduleDrawerOpen(false)}
        onConfirm={(schedule) => {
          setScheduleDrawerOpen(false)
          openSaveModal(schedule, 'customize')
        }}
      />

      <SaveModal
        open={saveOpen}
        schedule={pendingSchedule}
        onClose={() => {
          pendingScheduleSource.current = null
          setSaveOpen(false)
        }}
        onSave={() => {
          if (pendingScheduleSource.current === 'accept') {
            journeyRef.current?.commitAcceptSchedule()
          } else if (pendingScheduleSource.current === 'customize' && pendingSchedule) {
            journeyRef.current?.commitCustomizeSchedule(pendingSchedule)
          }
          pendingScheduleSource.current = null
          handleAccountSuccess()
        }}
      />

      <AuthModal
        open={authOpen}
        mode={authMode}
        onClose={() => setAuthOpen(false)}
        onSuccess={handleAccountSuccess}
        onSwitchMode={setAuthMode}
      />

      <BookDemoModal open={demoOpen} onClose={() => setDemoOpen(false)} />
    </div>
  )
}
