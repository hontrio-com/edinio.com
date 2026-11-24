/**
 * Pictograma butonului de chat. Desenata aici, nu adusa dintr-o biblioteca: butonul e pe fiecare pagina a
 * magazinului. O folosesc si butonul adevarat (`ButonContact`) si cel desenat in editor (`MartorButonContact`),
 * ca cele doua sa nu poata arata diferit.
 */
export function PictogramaChat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.3 8.7 8.7 0 0 1-3.7-.8L3 20.5l1.6-5a8.1 8.1 0 0 1-.9-4A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z" />
      <path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01" />
    </svg>
  );
}
