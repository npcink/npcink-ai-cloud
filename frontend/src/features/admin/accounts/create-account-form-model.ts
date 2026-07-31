export type CreateAccountFormValues = {
  name: string;
  primary_email: string;
  operator_display_name: string;
  operator_note: string;
  bind_default_free: boolean;
};

export type CreateAccountFormErrors = Partial<
  Record<'name' | 'primary_email', 'required' | 'invalid'>
>;

export type CreateAccountFormValidation =
  | { success: true; data: CreateAccountFormValues }
  | { success: false; errors: CreateAccountFormErrors };

export function validateCreateAccountForm(
  values: CreateAccountFormValues
): CreateAccountFormValidation {
  const data = {
    ...values,
    name: values.name.trim(),
    primary_email: values.primary_email.trim().toLowerCase(),
    operator_display_name: values.operator_display_name.trim(),
    operator_note: values.operator_note.trim(),
  };
  const errors: CreateAccountFormErrors = {};
  if (!data.name) errors.name = 'required';
  if (!data.primary_email) errors.primary_email = 'required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.primary_email)) {
    errors.primary_email = 'invalid';
  }
  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data };
}

export function buildCreateAccountPayload(values: CreateAccountFormValues) {
  return {
    name: values.name,
    primary_email: values.primary_email,
    metadata: {
      ...(values.operator_display_name
        ? { operator_display_name: values.operator_display_name }
        : {}),
      ...(values.operator_note ? { operator_note: values.operator_note } : {}),
    },
    bind_default_free: values.bind_default_free,
  };
}
