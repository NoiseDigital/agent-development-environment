// Privileged / admin-only UI gates.
// TODO: replace with real role-based auth once accounts exist.
// On by default in this pre-release build; set NEXT_PUBLIC_ADMIN_MODE=false to hide.
export const isAdmin = process.env.NEXT_PUBLIC_ADMIN_MODE !== 'false';
