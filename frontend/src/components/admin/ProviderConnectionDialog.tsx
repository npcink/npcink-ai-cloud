import {
  AdminWorkbenchDialog,
  type AdminWorkbenchDialogProps,
} from '@/components/admin/AdminWorkbenchDialog';

export type ProviderConnectionDialogProps = AdminWorkbenchDialogProps;

export function ProviderConnectionDialog(props: ProviderConnectionDialogProps) {
  return <AdminWorkbenchDialog {...props} />;
}
