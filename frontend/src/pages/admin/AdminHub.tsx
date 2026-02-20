import { useNavigate } from 'react-router-dom'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Monitor,
  MapPin,
  Upload,
  Building2,
  Calculator,
  Users,
} from 'lucide-react'

const adminSections = [
  {
    title: 'My Company',
    description: 'Company name, address, contact info, and fiscal year.',
    icon: Building2,
    to: '/settings',
  },
  {
    title: 'Users',
    description: 'Manage team members and access permissions.',
    icon: Users,
    to: '/users',
  },
  {
    title: 'Accounting Settings',
    description: 'Default GL account mappings for transactions.',
    icon: Calculator,
    to: '/accounting-settings',
  },
  {
    title: 'Preferences',
    description: 'Display theme, items per page, and personal settings.',
    icon: Monitor,
    to: '/settings/preferences',
  },
  {
    title: 'Tax Zones',
    description: 'Manage tax rates and postal code assignments.',
    icon: MapPin,
    to: '/admin/tax-zones',
  },
  {
    title: 'Data Import',
    description: 'Import customers, vendors, items, and more from CSV.',
    icon: Upload,
    to: '/admin/import',
  },
]

export default function AdminHub() {
  usePageTitle('Settings')
  const navigate = useNavigate()

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your company configuration and admin tools.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adminSections.map((section) => (
          <Card
            key={section.to}
            className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
            onClick={() => navigate(section.to)}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <section.icon className="h-5 w-5 text-muted-foreground" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{section.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
