'use client';
import { Button } from '@/components/ui/button';
export default function ApplicationError({ reset }: { reset: () => void }) {
  return <main className="mx-auto max-w-lg px-6 py-28"><h1 className="text-2xl font-medium">Workspace temporarily unavailable</h1><p className="my-4 text-sm leading-6 text-muted-foreground">The workspace could not be loaded. Check your connection and try again.</p><Button onClick={reset}>Try again</Button></main>;
}
