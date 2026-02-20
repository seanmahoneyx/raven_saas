import { useSettings } from '@/api/settings'

interface PrintFormField {
  label: string
  value: string | number | null | undefined
}

interface PrintFormColumn {
  header: string
  align?: 'left' | 'right' | 'center'
}

interface PrintFormProps {
  title: string
  documentNumber: string
  status: string
  fields: PrintFormField[]
  notes?: string | null
  /** Summary row: array of {label, value} shown in a horizontal bar */
  summary?: PrintFormField[]
  /** Lines table columns */
  columns?: PrintFormColumn[]
  /** Lines table rows — each row is an array of string/number values matching columns */
  rows?: (string | number | null)[][]
  /** Totals row at bottom of lines table */
  totals?: { label: string; value: string }[]
}

const s = {
  cellLabel: { padding: '6px 12px', border: '1px solid #ccc', background: '#f5f5f5', fontWeight: 600, width: '15%' } as React.CSSProperties,
  cellValue: { padding: '6px 12px', border: '1px solid #ccc', width: '35%' } as React.CSSProperties,
  th: (align: string = 'left') => ({ padding: '6px 8px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: align } as React.CSSProperties),
  td: (align: string = 'left') => ({ padding: '5px 8px', border: '1px solid #ccc', textAlign: align } as React.CSSProperties),
}

export default function PrintForm({ title, documentNumber, status, fields, notes, summary, columns, rows, totals }: PrintFormProps) {
  const { data: settings } = useSettings()

  // Build info pairs into rows of 2
  const fieldRows: PrintFormField[][] = []
  for (let i = 0; i < fields.length; i += 2) {
    fieldRows.push(fields.slice(i, i + 2))
  }

  return (
    <div className="print-only" style={{ color: 'black' }}>
      {/* Letterhead */}
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
          <div style={{ fontSize: '14pt', fontWeight: 600, marginTop: '4px' }}>
            {documentNumber}
          </div>
          <div style={{ fontSize: '9pt', color: '#555', marginTop: '4px', padding: '2px 10px', border: '1px solid #999', display: 'inline-block' }}>
            {status}
          </div>
        </div>
      </div>

      {/* Info Grid */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '10pt' }}>
        <tbody>
          {fieldRows.map((row, i) => (
            <tr key={i}>
              <td style={s.cellLabel}>{row[0]?.label}</td>
              <td style={s.cellValue}>{row[0]?.value ?? '—'}</td>
              {row[1] ? (
                <>
                  <td style={s.cellLabel}>{row[1].label}</td>
                  <td style={s.cellValue}>{row[1].value ?? '—'}</td>
                </>
              ) : (
                <td colSpan={2} style={{ border: '1px solid #ccc' }}></td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Row */}
      {summary && summary.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '10pt' }}>
          <thead>
            <tr>
              {summary.map((item, i) => (
                <th key={i} style={{ padding: '6px 12px', border: '1px solid #ccc', background: '#f5f5f5', textAlign: 'center' }}>
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {summary.map((item, i) => (
                <td key={i} style={{ padding: '8px 12px', border: '1px solid #ccc', textAlign: 'center', fontSize: '13pt', fontWeight: 700 }}>
                  {item.value ?? '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* Notes */}
      {notes && (
        <div style={{ marginBottom: '20px', padding: '8px 12px', border: '1px solid #ccc', fontSize: '10pt' }}>
          <span style={{ fontWeight: 600 }}>Notes: </span>{notes}
        </div>
      )}

      {/* Lines Table */}
      {columns && columns.length > 0 && rows && rows.length > 0 && (
        <>
          <div style={{ fontSize: '9pt', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px', color: '#555' }}>
            Line Items ({rows.length})
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt' }}>
            <thead>
              <tr>
                {columns.map((col, i) => (
                  <th key={i} style={s.th(col.align || 'left')}>{col.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j} style={s.td(columns[j]?.align || 'left')}>{cell ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
            {totals && totals.length > 0 && (
              <tfoot>
                {totals.map((total, i) => (
                  <tr key={i}>
                    <td
                      colSpan={columns.length - 1}
                      style={{ padding: '6px 8px', border: '1px solid #ccc', textAlign: 'right', fontWeight: i === totals.length - 1 ? 700 : 600, background: i === totals.length - 1 ? '#f5f5f5' : undefined }}
                    >
                      {total.label}
                    </td>
                    <td style={{ padding: '6px 8px', border: '1px solid #ccc', textAlign: 'right', fontWeight: i === totals.length - 1 ? 700 : 600, background: i === totals.length - 1 ? '#f5f5f5' : undefined }}>
                      {total.value}
                    </td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </>
      )}

      {/* Footer */}
      <div style={{ marginTop: '40px', paddingTop: '12px', borderTop: '1px solid #ccc', display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#999' }}>
        <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
        <span>{settings?.company_name || ''}</span>
      </div>
    </div>
  )
}
