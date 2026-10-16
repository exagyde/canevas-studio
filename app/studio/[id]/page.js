'use client';
import { useParams } from 'next/navigation';
import Studio from '@/components/studio/Studio';

export default function StudioPage() {
  const { id } = useParams();
  return <Studio projectId={decodeURIComponent(String(id))} />;
}
