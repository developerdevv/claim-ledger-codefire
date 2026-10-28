import { useState } from 'react'
import { Info, Menu, RotateCcw } from 'lucide-react'
import * as api from '../../lib/api'
import { useDemo } from '../../state/demo'
import { useToast } from '../ui/Toast'
import Button from '../ui/Button'
import ConfirmDialog from '../ui/ConfirmDialog'
import RoleSwitcher from './RoleSwitcher'

export default function TopBar({ title, onOpenDrawer }) {
  const { bumpRefresh } = useDemo()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    setResetting(true)
    try {
      await api.resetDemo()
      setConfirmOpen(false)
      bumpRefresh()
      toast({
        kind: 'success',
        title: 'Demo data restored',
        message: 'Facts, drafts, decisions and history are back to their starting state.',
      })
    } catch (err) {
      // Let ConfirmDialog surface the error inline; rethrow for its handler.
      setResetting(false)
      throw err
    }
    setResetting(false)
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="Open navigation menu"
          className="-ml-1 rounded-md p-2 text-ink-soft transition-colors hover:bg-tint hover:text-ink lg:hidden"
        >
          <Menu size={20} aria-hidden="true" />
        </button>

        <h1 className="font-heading text-lg leading-none font-semibold text-ink sm:text-xl">
          {title}
        </h1>

        <span className="hidden items-center gap-1.5 rounded-full border border-line-strong bg-tint px-2.5 py-1 text-[10px] font-semibold tracking-[0.08em] text-muted uppercase sm:inline-flex">
          <Info size={11} aria-hidden="true" strokeWidth={2.4} />
          Demo workspace · fictional data
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <RoleSwitcher />
          <Button
            size="sm"
            variant="secondary"
            icon={RotateCcw}
            onClick={() => setConfirmOpen(true)}
            title="Restore the demo workspace to its starting state"
          >
            <span className="hidden sm:inline">Reset demo data</span>
            <span className="sm:hidden">Reset</span>
          </Button>
        </div>

        <p className="w-full text-[10px] text-muted sm:hidden">
          Demo workspace · fictional data · role switch is a demo aid, not a login
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Reset demo data?"
        body="This restores all facts, drafts, decisions and history to the starting state of the demo. Anything you changed in this session will be lost."
        confirmLabel="Reset demo data"
        confirmVariant="dark"
        confirmIcon={RotateCcw}
        onConfirm={handleReset}
        onClose={() => !resetting && setConfirmOpen(false)}
      />
    </header>
  )
}
