import { useState, useEffect } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useUserPreferences, useUpdatePreferences } from '@/api/preferences'
import { useTheme } from '@/components/theme-provider'
import { toast } from 'sonner'
import { Settings, Monitor, Sun, Moon, Save } from 'lucide-react'

export default function Preferences() {
  usePageTitle('Preferences')
  const { data: prefs, isLoading } = useUserPreferences()
  const updatePrefs = useUpdatePreferences()
  const { setTheme } = useTheme()

  const [itemsPerPage, setItemsPerPage] = useState('25')
  const [theme, setThemeLocal] = useState('system')

  useEffect(() => {
    if (prefs) {
      setItemsPerPage(String(prefs.items_per_page || 25))
      setThemeLocal(prefs.theme || 'system')
    }
  }, [prefs])

  const handleSave = () => {
    const newPrefs = {
      items_per_page: parseInt(itemsPerPage),
      theme: theme as 'light' | 'dark' | 'system',
    }
    updatePrefs.mutate(newPrefs, {
      onSuccess: () => {
        setTheme(theme as 'light' | 'dark' | 'system')
        toast.success('Preferences saved')
      },
      onError: () => {
        toast.error('Failed to save preferences')
      },
    })
  }

  if (isLoading) return null

  return (
    <div className="container mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Preferences
        </h1>
        <p className="text-muted-foreground mt-1">
          Customize your Raven experience.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Display</CardTitle>
          <CardDescription>How things look and feel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Theme</Label>
            <div className="flex gap-2">
              {[
                { value: 'light', icon: Sun, label: 'Light' },
                { value: 'dark', icon: Moon, label: 'Dark' },
                { value: 'system', icon: Monitor, label: 'System' },
              ].map(({ value, icon: Icon, label }) => (
                <Button
                  key={value}
                  variant={theme === value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setThemeLocal(value)}
                  className="flex-1 gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items per page</Label>
            <Select value={itemsPerPage} onValueChange={setItemsPerPage}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10 items</SelectItem>
                <SelectItem value="25">25 items</SelectItem>
                <SelectItem value="50">50 items</SelectItem>
                <SelectItem value="100">100 items</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Number of rows to display in tables.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updatePrefs.isPending}>
          <Save className="mr-2 h-4 w-4" />
          Save Preferences
        </Button>
      </div>
    </div>
  )
}
