import { usePageTitle } from '@/hooks/usePageTitle'
import ItemFormShell from '@/components/items/ItemFormShell'

export default function RequestItem() {
  usePageTitle('New Item Request')
  return (
    <ItemFormShell
      mode="request"
      pageTitle="New Item Request"
      pageDescription="Submit a new product request for the operations team to set up"
    />
  )
}
