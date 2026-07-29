export type CreateAccountFormValues = {
  account_id: string;
  name: string;
  operator_display_name: string;
  operator_note: string;
  bind_default_free: boolean;
};

export type CreateAccountFormErrors = Partial<
  Record<'account_id' | 'name', 'required'>
>;

export type CreateAccountFormValidation =
  | { success: true; data: CreateAccountFormValues }
  | { success: false; errors: CreateAccountFormErrors };

export function validateCreateAccountForm(
  values: CreateAccountFormValues
): CreateAccountFormValidation {
  const data = {
    ...values,
    account_id: values.account_id.trim(),
    name: values.name.trim(),
    operator_display_name: values.operator_display_name.trim(),
    operator_note: values.operator_note.trim(),
  };
  const errors: CreateAccountFormErrors = {};
  if (!data.account_id) errors.account_id = 'required';
  if (!data.name) errors.name = 'required';
  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data };
}

export function buildCreateAccountPayload(values: CreateAccountFormValues) {
  return {
    account_id: values.account_id,
    name: values.name,
    metadata: {
      ...(values.operator_display_name
        ? { operator_display_name: values.operator_display_name }
        : {}),
      ...(values.operator_note ? { operator_note: values.operator_note } : {}),
    },
    bind_default_free: values.bind_default_free,
  };
}
