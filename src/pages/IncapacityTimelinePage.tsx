import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PageTitle } from '@/components/layout/PageTitle'
import { Bell, AlertTriangle, Shield, Heart, ChevronDown, ChevronUp, Clock, Users, CreditCard, FileText, ToggleLeft, ToggleRight, Info } from 'lucide-react'

interface StageAction {
  id: string
  label: string
  description: string
  icon: typeof Bell
  enabled: boolean
}

interface Stage {
  id: string
  title: string
  subtitle: string
  icon: typeof Bell
  color: string
  bgClass: string
  dotClass: string
  timeLabel: string
  actions: StageAction[]
}

const stages: Stage[] = [
  {
    id: 'alert',
    title: 'Alert',
    subtitle: 'Early signs — forgetfulness, missed patterns, skipped payments',
    icon: Bell,
    color: 'text-purple-400',
    bgClass: 'bg-gold-subtle',
    dotClass: 'bg-gold shadow-[0_0_8px_rgba(212,160,23,0.4)]',
    timeLabel: 'Immediate',
    actions: [
      { id: 'notify-trustees', label: 'Notify Trustees', description: 'Alert your trusted persons about unusual inactivity', icon: Users, enabled: true },
      { id: 'gentle-reminders', label: 'Gentle Reminders', description: 'Send you automated reminders via email and SMS', icon: Bell, enabled: true },
      { id: 'monitor-activity', label: 'Monitor Activity', description: 'Increase monitoring frequency to detect recovery', icon: Clock, enabled: true },
    ],
  },
  {
    id: 'intervention',
    title: 'Intervention',
    subtitle: 'Hospitalized, acute illness, or incapacitated — short-term',
    icon: AlertTriangle,
    color: 'text-purple-400',
    bgClass: 'bg-orange/10',
    dotClass: 'bg-orange shadow-[0_0_8px_rgba(234,88,12,0.4)]',
    timeLabel: 'Within 24h',
    actions: [
      { id: 'pay-bills', label: 'Auto-Pay Bills', description: 'Activate automated bill payment from designated accounts', icon: CreditCard, enabled: false },
      { id: 'trustee-access', label: 'Grant Trustee Access', description: 'Give trusted persons access to financial accounts', icon: Users, enabled: false },
      { id: 'hold-mail', label: 'Hold Mail & Deliveries', description: 'Request hold on mail and scheduled deliveries', icon: FileText, enabled: false },
      { id: 'notify-family', label: 'Notify Family', description: 'Send situation update to all trusted persons', icon: Users, enabled: true },
    ],
  },
  {
    id: 'stewardship',
    title: 'Stewardship',
    subtitle: 'Long-term incapacity — dementia, coma, prolonged care',
    icon: Shield,
    color: 'text-text',
    bgClass: 'bg-bg-elevated',
    dotClass: 'bg-text shadow-[0_0_8px_rgba(192,192,192,0.4)]',
    timeLabel: '30 days',
    actions: [
      { id: 'full-admin', label: 'Full Administration', description: 'Complete financial management by appointed administrator', icon: Shield, enabled: false },
      { id: 'estate-manage', label: 'Manage Investments', description: 'Activate investment management per your instructions', icon: CreditCard, enabled: false },
      { id: 'property-manage', label: 'Property Management', description: 'Assign property oversight to designated person', icon: FileText, enabled: false },
      { id: 'legal-proxy', label: 'Activate Legal Proxy', description: 'Empower power of attorney for legal decisions', icon: AlertTriangle, enabled: false },
    ],
  },
  {
    id: 'legacy',
    title: 'Legacy',
    subtitle: 'In the event of death — estate execution and final wishes',
    icon: Heart,
    color: 'text-purple-400',
    bgClass: 'bg-gold-subtle',
    dotClass: 'bg-gold shadow-[0_0_8px_rgba(212,160,23,0.4)]',
    timeLabel: 'Upon confirmation',
    actions: [
      { id: 'release-letters', label: 'Release Legacy Letters', description: 'Deliver your personal messages to each trusted person', icon: Heart, enabled: false },
      { id: 'execute-will', label: 'Execute Will', description: 'Distribute assets per your legal will instructions', icon: FileText, enabled: false },
      { id: 'close-accounts', label: 'Close Digital Accounts', description: 'Memorialize or close social media and online accounts', icon: Users, enabled: false },
      { id: 'transfer-assets', label: 'Transfer Assets', description: 'Distribute financial assets to named beneficiaries', icon: CreditCard, enabled: false },
    ],
  },
]

export function IncapacityTimelinePage() {
  const [expandedStage, setExpandedStage] = useState<string | null>('alert')
  const [stageStates, setStageStates] = useState<Stage[]>(stages)

  const toggleAction = (stageId: string, actionId: string) => {
    setStageStates(prev => prev.map(stage => {
      if (stage.id !== stageId) return stage
      return {
        ...stage,
        actions: stage.actions.map(a =>
          a.id === actionId ? { ...a, enabled: !a.enabled } : a
        ),
      }
    }))
  }

  const toggleStage = (stageId: string) => {
    setExpandedStage(prev => prev === stageId ? null : stageId)
  }

  const enabledCount = (actions: StageAction[]) => actions.filter(a => a.enabled).length

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 animate-fade-in">
      <PageTitle
        title="Incapacity Timeline"
        subtitle="Stage-by-stage planning for every phase of incapacity — from early warning to legacy"
        accent="gold"
      />

      <div className="card p-5 mb-8 flex items-start gap-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-gold shrink-0 mt-0.5">
          <Info className="h-4 w-4 text-purple-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-text">How it works</p>
          <p className="text-xs text-text-secondary mt-1 leading-relaxed">
            Configure what happens at each stage of incapacity. Toggle actions on or off as your needs change.
            Your financial administrator executes these automatically when the corresponding triggers are met.
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-[19px] top-8 bottom-8 w-px bg-gradient-to-b from-gold/40 via-text-muted/20 to-gold/40" />

        <div className="space-y-6">
          {stageStates.map((stage, idx) => {
            const Icon = stage.icon
            const expanded = expandedStage === stage.id
            const enabled = enabledCount(stage.actions)

            return (
              <div key={stage.id} className="relative">
                <div className="flex">
                  <div className="flex flex-col items-center mr-4">
                    <div className={cn(
                      'relative z-10 flex h-[38px] w-[38px] items-center justify-center rounded-xl border-2 border-bg transition-all duration-300',
                      stage.bgClass,
                      expanded ? 'ring-2 ring-gold/30' : ''
                    )}>
                      <Icon className={cn('h-4 w-4', stage.color)} />
                    </div>
                    {idx < 3 && <div className="flex-1 w-px bg-border/40 min-h-[24px]" />}
                  </div>

                  <div className="flex-1 pb-6">
                    <button
                      onClick={() => toggleStage(stage.id)}
                      className="w-full flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div>
                          <div className="flex items-center gap-2.5">
                            <h3 className={cn('text-base font-bold', stage.color)}>{stage.title}</h3>
                            <span className={cn(
                              'text-[9px] font-medium px-1.5 py-0.5 rounded-full border tracking-wider uppercase',
                              stage.id === 'alert' ? 'border-gold/30 text-purple-400/70' :
                              stage.id === 'intervention' ? 'border-orange/30 text-purple-400/70' :
                              stage.id === 'stewardship' ? 'border-text-muted/30 text-text-muted/70' :
                              'border-gold/30 text-purple-400/70'
                            )}>
                              {stage.timeLabel}
                            </span>
                          </div>
                          <p className="text-xs text-text-secondary mt-0.5 text-left">{stage.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-text-muted">{enabled}/{stage.actions.length} active</span>
                        {expanded ? <ChevronUp className="h-4 w-4 text-text-muted" /> : <ChevronDown className="h-4 w-4 text-text-muted" />}
                      </div>
                    </button>

                    {expanded && (
                      <div className="mt-4 space-y-2 animate-fade-in">
                        {stage.actions.map(action => {
                          const ActionIcon = action.icon
                          return (
                            <div key={action.id} className="flex items-center gap-3 bg-bg-elevated rounded-lg px-4 py-3 border border-border/30 hover:border-gold/10 transition-all">
                              <div className={cn(
                                'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                                action.enabled ? 'bg-gold-subtle' : 'bg-black/[0.03] dark:bg-white/[0.03]'
                              )}>
                                <ActionIcon className={cn('h-3.5 w-3.5', action.enabled ? 'text-purple-400' : 'text-text-muted/50')} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn('text-xs font-medium', action.enabled ? 'text-text' : 'text-text-muted/70')}>{action.label}</p>
                                <p className="text-[10px] text-text-muted/60 truncate">{action.description}</p>
                              </div>
                              <button
                                onClick={() => toggleAction(stage.id, action.id)}
                                className="shrink-0 transition-all hover:scale-105"
                              >
                                {action.enabled ? (
                                  <ToggleRight className="h-5 w-5 text-purple-400" />
                                ) : (
                                  <ToggleLeft className="h-5 w-5 text-text-muted/40" />
                                )}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-5 mt-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-text">Timeline Status</p>
          <p className="text-xs text-text-secondary mt-0.5">Your administrator is watching for early signs</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" />
          <span className="text-xs font-medium text-purple-400">Monitoring Active</span>
        </div>
      </div>
    </div>
  )
}
