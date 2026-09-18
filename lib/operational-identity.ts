export interface OperationalIdentity {
  operator: string | null;
  supportEmail: string | null;
  configured: boolean;
}

export function isSupportEmail(value: string | undefined) {
  if (!value || value.length > 254 || /[\s\u0000-\u001f\u007f]/.test(value))
    return false;
  return /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i.test(
    value,
  );
}

export function readOperationalIdentity(
  read: (key: string) => string | undefined,
): OperationalIdentity {
  const operator = read("LEGAL_OPERATOR_NAME")?.trim() || null;
  const supportEmail = read("SUPPORT_EMAIL")?.trim() || null;
  const validOperator =
    !!operator &&
    operator.length <= 200 &&
    !/[\u0000-\u001f\u007f]/.test(operator);
  const validEmail = isSupportEmail(supportEmail || undefined);
  return {
    operator: validOperator ? operator : null,
    supportEmail: validEmail ? supportEmail : null,
    configured: validOperator && validEmail,
  };
}
