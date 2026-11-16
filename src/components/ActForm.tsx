import { createContext, useContext, useState, type FormEvent, type FormHTMLAttributes } from "react";

/** Lets <SubmitButton> inside an <ActForm> show the "busy" state. */
export const FormPending = createContext(false);
export const useFormPending = () => useContext(FormPending);

/**
 * A form that runs `action(formData)` and clears its fields ONLY when the action succeeds.
 * (A React 19 `<form action>` always clears the form, so a validation error would lose
 * everything the user typed.) Use with actions from useAct(), which resolve to true/false.
 */
export function ActForm({
  action,
  keepValues,
  children,
  ...rest
}: Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "onSubmit"> & {
  action: (fd: FormData) => Promise<boolean>;
  /** Don't clear the fields after a successful save (edit forms). */
  keepValues?: boolean;
}) {
  const [pending, setPending] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    setPending(true);
    try {
      // Include the clicked button's name/value (e.g. "approve" vs "return").
      const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
      const ok = await action(new FormData(form, submitter?.form === form ? submitter : undefined));
      if (ok && !keepValues) form.reset();
    } finally {
      setPending(false);
    }
  }
  return (
    <FormPending.Provider value={pending}>
      <form {...rest} onSubmit={submit}>
        {children}
      </form>
    </FormPending.Provider>
  );
}
