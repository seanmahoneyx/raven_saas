import { usePageTitle } from '@/hooks/usePageTitle'
import ItemFormShell from '@/components/items/ItemFormShell'

export default function CreateItem() {
  usePageTitle('Create Item')
  return (
    <ItemFormShell
      mode="create"
      pageTitle="Create New Item"
      pageDescription="Add a new product to your catalog"
    />
  )
}
