import { Flow } from '@/components/Flow';
import { StoreHydrator } from '@/components/StoreHydrator';

export default function HomePage() {
  return (
    <>
      <StoreHydrator />
      <Flow />
    </>
  );
}
