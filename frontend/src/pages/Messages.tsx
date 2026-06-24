import { usePageTitle } from '@/hooks/usePageTitle'
import { PageHeader } from '@/components/page'
import { DirectMessages } from '@/components/collaboration/DirectMessages'

export default function Messages() {
  usePageTitle('Messages')

  return (
    <div className="raven-page" style={{ minHeight: '100vh' }}>
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-7 pb-16">
        <PageHeader
          title="Messages"
          description="Direct messages with your team"
        />
        <div className="rounded-[14px] overflow-hidden animate-in delay-1"
          style={{ border: '1px solid var(--so-border)', background: 'var(--so-surface)' }}>
          <DirectMessages />
        </div>
      </div>
    </div>
  )
}
