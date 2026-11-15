import { useFormPending } from "./ActForm";

export function SubmitButton({
  children,
  className = "btn",
  confirm,
}: {
  children: React.ReactNode;
  className?: string;
  confirm?: string;
}) {
  const pending = useFormPending();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}
