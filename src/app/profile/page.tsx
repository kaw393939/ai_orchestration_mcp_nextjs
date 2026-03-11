import Link from "next/link";

export default function ProfilePage() {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-sm opacity-50">
          This page is currently under development. Check back soon.
        </p>
        <Link
          href="/"
          className="inline-block mt-4 px-5 py-2 rounded-full text-xs font-semibold bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-opacity"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
