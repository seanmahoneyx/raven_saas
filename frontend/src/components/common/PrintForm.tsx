import { useSettings } from '@/api/settings'

interface AddressBlock {
  label: string
  name: string
  address?: string | null
}

interface PrintFormField {
  label: string
  value: string | number | null | undefined
}

interface PrintFormColumn {
  header: string
  align?: 'left' | 'right' | 'center'
  width?: string
}

interface PrintFormProps {
  title: string
  documentNumber: string
  status: string
  /** Address blocks shown below the header (Bill To, Ship To, Vendor, etc.) */
  addresses?: AddressBlock[]
  /** Key-value detail fields shown in the info strip */
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
  /** Optional message printed at the bottom (e.g. "Thank you for your business!") */
  footerMessage?: string
}

export default function PrintForm({
  title, documentNumber, status, addresses, fields, notes,
  summary, columns, rows, totals, footerMessage,
}: PrintFormProps) {
  const { data: settings } = useSettings()

  return (
    <div className="print-only" style={{ color: '#000', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '9.5pt', lineHeight: 1.4 }}>

      {/* ═══ HEADER: Company + Document Title ═══ */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
        <tbody>
          <tr>
            {/* Company info — left side */}
            <td style={{ verticalAlign: 'top', width: '55%', paddingBottom: '12px' }}>
              <div style={{ fontSize: '18pt', fontWeight: 700, letterSpacing: '-0.5px', color: '#1a1a1a' }}>
                {settings?.company_name || 'Company'}
              </div>
              {settings?.company_address && (
                <div style={{ fontSize: '9pt', color: '#444', whiteSpace: 'pre-line', marginTop: '3px', lineHeight: 1.5 }}>
                  {settings.company_address}
                </div>
              )}
              {(settings?.company_phone || settings?.company_email) && (
                <div style={{ fontSize: '9pt', color: '#444', marginTop: '2px' }}>
                  {[settings?.company_phone, settings?.company_email].filter(Boolean).join('  |  ')}
                </div>
              )}
            </td>
            {/* Document title — right side */}
            <td style={{ verticalAlign: 'top', textAlign: 'right', paddingBottom: '12px' }}>
              <div style={{ fontSize: '20pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#1a1a1a' }}>
                {title}
              </div>
              <div style={{ marginTop: '6px' }}>
                <table style={{ marginLeft: 'auto', borderCollapse: 'collapse', fontSize: '9.5pt' }}>
                  <tbody>
                    <tr>
                      <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: 600, color: '#555' }}>Number:</td>
                      <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: 700, fontSize: '11pt' }}>{documentNumber}</td>
                    </tr>
                    <tr>
                      <td style={{ padding: '3px 10px', textAlign: 'right', fontWeight: 600, color: '#555' }}>Status:</td>
                      <td style={{ padding: '3px 10px', textAlign: 'right' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '1px 10px',
                          border: '1.5px solid #333',
                          fontWeight: 700,
                          fontSize: '8.5pt',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          {status}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Divider line */}
      <div style={{ borderTop: '2.5px solid #1a1a1a', marginBottom: '16px' }} />

      {/* ═══ ADDRESS BLOCKS ═══ */}
      {addresses && addresses.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <tbody>
            <tr>
              {addresses.map((addr, i) => (
                <td
                  key={i}
                  style={{
                    verticalAlign: 'top',
                    width: `${100 / addresses.length}%`,
                    paddingRight: i < addresses.length - 1 ? '24px' : 0,
                  }}
                >
                  <div style={{
                    fontSize: '8pt',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    color: '#777',
                    marginBottom: '4px',
                    paddingBottom: '3px',
                    borderBottom: '1px solid #ddd',
                  }}>
                    {addr.label}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '10pt', color: '#1a1a1a' }}>
                    {addr.name}
                  </div>
                  {addr.address && (
                    <div style={{ fontSize: '9pt', color: '#444', whiteSpace: 'pre-line', marginTop: '2px', lineHeight: 1.5 }}>
                      {addr.address}
                    </div>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* ═══ DETAIL STRIP (date, PO#, terms, etc.) ═══ */}
      {fields.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px' }}>
          <thead>
            <tr>
              {fields.map((f, i) => (
                <th key={i} style={{
                  padding: '5px 10px',
                  background: '#f0f0f0',
                  border: '1px solid #ccc',
                  fontSize: '8pt',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: '#555',
                  textAlign: 'center',
                }}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {fields.map((f, i) => (
                <td key={i} style={{
                  padding: '6px 10px',
                  border: '1px solid #ccc',
                  textAlign: 'center',
                  fontWeight: 600,
                  fontSize: '9.5pt',
                }}>
                  {f.value ?? '\u2014'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* ═══ SUMMARY BAR (optional) ═══ */}
      {summary && summary.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '9.5pt' }}>
          <thead>
            <tr>
              {summary.map((item, i) => (
                <th key={i} style={{ padding: '5px 10px', border: '1px solid #ccc', background: '#f0f0f0', textAlign: 'center', fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#555' }}>
                  {item.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {summary.map((item, i) => (
                <td key={i} style={{ padding: '8px 10px', border: '1px solid #ccc', textAlign: 'center', fontSize: '12pt', fontWeight: 700 }}>
                  {item.value ?? '\u2014'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* ═══ LINE ITEMS TABLE ═══ */}
      {columns && columns.length > 0 && rows && rows.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5pt', marginBottom: '4px' }}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} style={{
                  padding: '6px 10px',
                  background: '#1a1a1a',
                  color: '#fff',
                  fontSize: '8pt',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  textAlign: (col.align || 'left') as React.CSSProperties['textAlign'],
                  width: col.width,
                }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 1 ? '#f9f9f9' : '#fff' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{
                    padding: '6px 10px',
                    borderBottom: '1px solid #e0e0e0',
                    textAlign: (columns[j]?.align || 'left') as React.CSSProperties['textAlign'],
                    verticalAlign: 'top',
                  }}>
                    {cell ?? '\u2014'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ═══ TOTALS ═══ */}
      {totals && totals.length > 0 && (
        <table style={{ marginLeft: 'auto', borderCollapse: 'collapse', marginBottom: '20px', minWidth: '250px' }}>
          <tbody>
            {totals.map((total, i) => {
              const isLast = i === totals.length - 1
              return (
                <tr key={i}>
                  <td style={{
                    padding: '5px 14px',
                    textAlign: 'right',
                    fontWeight: isLast ? 700 : 600,
                    fontSize: isLast ? '11pt' : '9.5pt',
                    borderTop: isLast ? '2px solid #1a1a1a' : 'none',
                    color: '#333',
                  }}>
                    {total.label}
                  </td>
                  <td style={{
                    padding: '5px 14px',
                    textAlign: 'right',
                    fontWeight: isLast ? 700 : 600,
                    fontSize: isLast ? '11pt' : '9.5pt',
                    borderTop: isLast ? '2px solid #1a1a1a' : 'none',
                    minWidth: '100px',
                  }}>
                    {total.value}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* ═══ NOTES ═══ */}
      {notes && (
        <div style={{ marginBottom: '20px', padding: '10px 12px', background: '#f9f9f9', border: '1px solid #ddd', fontSize: '9pt' }}>
          <div style={{ fontWeight: 700, fontSize: '8pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#777', marginBottom: '4px' }}>Notes / Memo</div>
          <div style={{ color: '#333' }}>{notes}</div>
        </div>
      )}

      {/* ═══ FOOTER MESSAGE ═══ */}
      {footerMessage && (
        <div style={{ textAlign: 'center', fontSize: '10pt', fontWeight: 600, color: '#555', marginBottom: '16px', marginTop: '24px' }}>
          {footerMessage}
        </div>
      )}

      {/* ═══ FOOTER ═══ */}
      <div style={{
        marginTop: '32px',
        paddingTop: '8px',
        borderTop: '1px solid #ccc',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '7.5pt',
        color: '#999',
      }}>
        <span>Printed {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
        <span>{settings?.company_name || ''}</span>
      </div>
    </div>
  )
}
