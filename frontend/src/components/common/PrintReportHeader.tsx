import { useSettings } from '@/api/settings'

interface PrintReportHeaderProps {
  title: string
  subtitle?: string
  dateRange?: string
}

export default function PrintReportHeader({ title, subtitle, dateRange }: PrintReportHeaderProps) {
  const { data: settings } = useSettings()

  return (
    <div className="print-only" style={{ color: 'black' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px', paddingBottom: '16px', borderBottom: '3px solid #333' }}>
        <div>
          <div style={{ fontSize: '22pt', fontWeight: 700, letterSpacing: '-0.5px' }}>
            {settings?.company_name || 'Company'}
          </div>
          {settings?.company_address && (
            <div style={{ fontSize: '9pt', color: '#555', whiteSpace: 'pre-line', marginTop: '4px' }}>
              {settings.company_address}
            </div>
          )}
          {(settings?.company_phone || settings?.company_email) && (
            <div style={{ fontSize: '9pt', color: '#555', marginTop: '2px' }}>
              {[settings?.company_phone, settings?.company_email].filter(Boolean).join(' | ')}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '2px' }}>
            {title}
          </div>
          {subtitle && (
            <div style={{ fontSize: '11pt', fontWeight: 600, marginTop: '4px' }}>
              {subtitle}
            </div>
          )}
          {dateRange && (
            <div style={{ fontSize: '10pt', color: '#555', marginTop: '4px' }}>
              {dateRange}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function PrintFooter() {
  const { data: settings } = useSettings()
  return (
    <div className="print-only" style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
      <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
      <span>{settings?.company_name || ''}</span>
    </div>
  )
}
